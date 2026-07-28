#!/usr/bin/env python3
"""Independently verify an mcpindex verdict-corpus anchor. No dependencies, no trust.

WHY THIS FILE EXISTS. /trust told readers to "recompute the corpus root from
data/verdicts.json, fold the chain, then `ots verify`". That was not followable: the exact
canonicalisation lives in a private repo, and a reimplementer who guesses one rule wrong
gets a different digest and reasonably concludes the anchor is fake. A verification recipe
that cannot be executed is worse than none - it asks for trust while appearing not to.

This is the recipe, in full, in the public repo, using only the standard library.

    python3 scripts/verify_anchor.py                 # verify every confirmed anchor
    python3 scripts/verify_anchor.py --seq 2         # just one

It re-derives the roots from YOUR checkout of verdicts.json. It does NOT phone home.

WHAT IT CANNOT TELL YOU, stated plainly rather than left for you to discover:

  * Whether this ledger is COMPLETE. Nothing inside a repository can prove that anchors
    were not removed from its end. Deleting the newest entries leaves a chain that is
    perfectly self-consistent. Orphaned .ots files usually give it away and are reported
    as failures, but an attacker who deletes those too leaves no trace here. To close
    this you need a witness the publisher does not control: compare the newest `seq` and
    block height against a copy held elsewhere.
  * Whether a verdict is TRUE. An anchor fixes when a set of verdicts existed, not
    whether any of them is correct.
  * Whether the newest verdicts are anchored at all. They usually are not - the corpus is
    republished about twelve times a day and anchored once, so a gap is the normal state,
    not a fault. The gap is REPORTED, in the summary line, and does not affect the exit
    code: it is a measurement, not a test, and an exit code that fired ~92% of the time
    would carry no information and would train you to ignore the one channel that reports
    real tampering.

Exit codes:
  0  every anchor checked verified
  1  tampering detected
  3  could not check something (missing library, shallow clone, no git history)
  2  usage error
To check the Bitcoin attestation as well, install OpenTimestamps and run:

    ots info public/anchors/<chain_root_hex>.ots          # offline; prints the block height
    printf 'sha256:%s' <chain_root_hex> > root.txt
    ots verify -f root.txt public/anchors/<chain_root_hex>.ots    # needs a Bitcoin node

Two things the original published command got wrong, both of which made it fail for
everyone who tried it. `ots verify` needs the PREIMAGE, not the digest - the stamped bytes
are the 71-character ASCII string "sha256:<hex>", not the 32 raw bytes - and without -f it
looks for a local file named after the proof, which the reader never has. `ots verify` also
requires a Bitcoin node to check the block header; `ots info` reads the attestation offline,
which is what most readers actually want.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LEDGER = REPO / "data" / "verdict-anchors.json"
VERDICTS_REL = "data/verdicts.json"

# ---------------------------------------------------------------------------
# THE CANONICALISATION. Every rule here is load-bearing; changing any one of them
# produces a different digest. This mirrors trust.contract.canonical_bytes.
#
# The one most likely to be guessed wrong is ensure_ascii=True. RFC 8785 (JCS) specifies
# the opposite, and the live corpus holds ~750 non-ASCII strings, so a JCS-conformant
# implementation diverges immediately rather than subtly.
# ---------------------------------------------------------------------------
FLOAT_FORMAT_SPEC = ".17e"
_MAX_DEPTH = 64


def _canonicalize(o, depth: int = 0):
    if depth > _MAX_DEPTH:
        raise ValueError("canonical depth exceeded")
    if o is None or isinstance(o, bool):
        return o
    if isinstance(o, float):
        if o != o or o in (float("inf"), float("-inf")):
            raise ValueError("non-finite float is not canonicalizable")
        if o == 0.0:
            o = 0.0  # collapse -0.0 so semantically equal floats hash equal
        return format(o, FLOAT_FORMAT_SPEC)
    if isinstance(o, int):
        return o
    if isinstance(o, str):
        return unicodedata.normalize("NFC", o)
    if isinstance(o, dict):
        # Sort over the PRE-NFC keys, normalise after; json.dumps(sort_keys=True) then
        # sorts the POST-NFC keys. Both steps are required to reproduce the digest.
        return {
            unicodedata.normalize("NFC", str(k)): _canonicalize(o[k], depth + 1)
            for k in sorted(o, key=str)
        }
    if isinstance(o, (list, tuple)):
        return [_canonicalize(v, depth + 1) for v in o]
    raise TypeError(f"not canonicalizable: {type(o).__name__}")


def canonical_bytes(obj) -> bytes:
    return json.dumps(
        _canonicalize(obj),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def verdict_digest(record) -> str:
    """Digest of ONE verdict record - the whole record, not its `content_hash` field.

    `content_hash` hashes the screened description, so a verdict flipping PASS to FAIL
    under an unchanged description would not move it. That is the single change a verdict
    anchor most needs to catch.
    """
    return "sha256:" + hashlib.sha256(canonical_bytes(record)).hexdigest()


def corpus_root(verdicts: dict) -> str:
    """Root over the whole corpus. Note the two-level leaf shape - it is not a flat map."""
    heads = {slug: verdict_digest(rec) for slug, rec in verdicts.items()}
    leaves = [{"chain_key": k, "head": heads[k]} for k in sorted(heads)]
    return "sha256:" + hashlib.sha256(canonical_bytes(leaves)).hexdigest()


def chain_root(prev_chain_root: str | None, root: str) -> str:
    return "sha256:" + hashlib.sha256(
        canonical_bytes([prev_chain_root, root])
    ).hexdigest()


def load_corpus_at_raw(commit: str) -> bytes:
    if not _COMMIT_RE.fullmatch(commit):
        raise ValueError(f"corpus_commit is not a full commit sha: {commit[:32]!r}")
    return subprocess.run(
        # --end-of-options so an option-shaped value can never be read as a flag, even if
        # this call is later rewritten into a form where the trailing path no longer
        # happens to block it.
        ["git", "-C", str(REPO), "show", "--end-of-options", f"{commit}:{VERDICTS_REL}"],
        capture_output=True, check=True,
    ).stdout


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seq", type=int, help="verify only this anchor")
    args = ap.parse_args()

    ledger = json.loads(LEDGER.read_text())
    if ledger.get("schema_version") != "1":
        print(f"unsupported schema_version {ledger.get('schema_version')!r}", file=sys.stderr)
        return 2

    prev_chain = None
    prev_root: str | None = None
    prev_seq = 0
    failures = 0
    skipped = 0
    checked = 0
    newest_anchored: str | None = None
    uncovered = 0
    newest_all: str | None = None
    referenced: set[str] = set()
    for e in ledger["anchors"]:
        missing = [k for k in ("seq", "root", "chain_root", "proof") if k not in e]
        if missing:
            print(f"anchor #?  FAIL  malformed ledger entry, missing {missing}")
            failures += 1
            continue
        want_chain = chain_root(prev_chain, e["root"])
        chain_ok = want_chain == e["chain_root"]
        # Structural checks the producer enforces and the first version of this script
        # dropped. Each one alone lets a forgery through: a renumbered seq, a prev_root
        # pointing at nothing, or a proof path repointed at another anchor's file.
        want_seq = prev_seq + 1
        seq_ok = e["seq"] == want_seq
        prev_ok = e.get("prev_root") == prev_root
        hexed = e["chain_root"].replace("sha256:", "")
        proof_ok = e["proof"] == f"anchors/{hexed}.ots"
        prev_chain, prev_root, prev_seq = e["chain_root"], e["root"], e["seq"]
        # Track the newest anchor's commit across ALL entries, before the filter, so
        # coverage stays a statement about the corpus rather than about the selection.
        if e.get("corpus_commit"):
            newest_all = e["corpus_commit"]
        if args.seq is not None and e["seq"] != args.seq:
            continue
        checked += 1
        commit = e.get("corpus_commit")

        print(f"anchor #{e['seq']}  (stamped {e['stamped_at'][:19]}Z)")
        for label, ok, detail in (
            ("chain_root", chain_ok, f"expected {want_chain}"),
            ("seq", seq_ok, f"expected {want_seq}"),
            ("prev_root", prev_ok, "does not point at the preceding anchor"),
            ("proof path", proof_ok, f"expected anchors/{hexed}.ots"),
        ):
            if ok:
                print(f"  {label:<11} ok")
            else:
                print(f"  {label:<11} FAIL  {detail}"); failures += 1

        if not commit:
            # NOT a pass. The field's absence is indistinguishable from an attacker
            # deleting it, and the previous version printed a reassuring "predates the
            # field" note and counted it as success.
            print("  corpus      UNVERIFIED  no corpus_commit; the snapshot cannot be pinned")
            skipped += 1
        else:
            try:
                raw = load_corpus_at_raw(commit)
            except ValueError as err:
                # A malformed commit is a FAILURE, not an "unverified". The ledger is
                # asserting something it cannot back, and an unpinned ref like "HEAD" would
                # otherwise resolve against whatever the reader has checked out.
                print(f"  corpus      FAIL  {err}")
                failures += 1
                raw = None
            except subprocess.CalledProcessError:
                print(f"  corpus      UNVERIFIED  commit {commit[:12]} absent "
                      f"(shallow clone? try: git fetch --unshallow)")
                skipped += 1
                raw = None
            if raw is not None:
                verdicts = json.loads(raw)
                got = corpus_root(verdicts)
                if got == e["root"]:
                    print(f"  root        ok    {got}  @ {commit[:12]}")
                    newest_anchored = commit
                else:
                    print(f"  root        FAIL  got {got}\n                    want {e['root']}")
                    failures += 1
                # verdict_count is rendered on /trust as fact; assert it rather than echo it.
                if len(verdicts) != e["verdict_count"]:
                    print(f"  count       FAIL  ledger says {e['verdict_count']}, "
                          f"corpus has {len(verdicts)}")
                    failures += 1
                else:
                    print(f"  count       ok    {e['verdict_count']} verdicts")

        blocks = (e.get("bitcoin") or {}).get("block_heights") or []
        proof_path = REPO / "public" / e["proof"]
        referenced.add(e["proof"])
        if blocks:
            if not proof_ok:
                print("  bitcoin     FAIL  proof path is not pinned to this anchor")
                failures += 1
            elif not proof_path.is_file():
                print(f"  bitcoin     FAIL  ledger claims block(s) {blocks} but "
                      f"public/{e['proof']} is missing"); failures += 1
            else:
                try:
                    attested = ots_attested_heights(proof_path, e["chain_root"])
                except ValueError as err:
                    print(f"  bitcoin     FAIL  {err}"); failures += 1
                else:
                    if attested is None:
                        # Cannot check != checked. Counted as unverified so the summary
                        # cannot read as a pass.
                        print("  bitcoin     UNVERIFIED  pip install opentimestamps-client "
                              "to check the proof")
                        skipped += 1
                    elif sorted(attested) != sorted(blocks):
                        print(f"  bitcoin     FAIL  proof attests {attested}, "
                              f"ledger claims {blocks}"); failures += 1
                    else:
                        print(f"  bitcoin     ok    proof binds to this anchor and attests "
                              f"block(s) {attested}")
        else:
            print("  bitcoin     pending (stamped, not yet confirmed on-chain)")
        print()

    if not checked:
        print("no matching anchor", file=sys.stderr)
        return 2

    # THE ANCHORED CORPUS IS NOT THE ONE YOU ARE READING. The previous version verified a
    # blob out of git history and said nothing about the file in front of you - so a forged
    # working tree produced "0 failure(s)" and a reader concluded the file they had was
    # anchored. Report the gap explicitly, and fail on a dirty tree.
    # A ledger can be internally perfect and still be a rewrite. Orphaned proofs are the
    # external witness: an attacker who truncates or re-genesises the chain leaves the
    # deleted anchors' .ots files behind in the same publication.
    if args.seq is None:
        orphans = orphaned_proofs(referenced)
        if orphans:
            print(f"ORPHANED PROOFS: {len(orphans)} .ots file(s) referenced by no anchor.")
            for o in orphans[:5]:
                print(f"  {o}")
            print("  A published proof with no ledger entry means anchors were removed or")
            print("  the chain was rewritten around them. The remaining ledger can still be")
            print("  perfectly self-consistent; this is the evidence that it is not complete.")
            failures += len(orphans)

    matches = working_tree_matches_head()
    if matches is None:
        print("WORKING TREE UNVERIFIED: not a git checkout (ZIP download?).")
        print("  Nothing here can tell whether data/verdicts.json is the published file.")
        print("  Re-run from `git clone https://github.com/mcpindex-ai/mcpindex-web`.")
        skipped += 1
    elif not matches:
        print("WORKING TREE DIFFERS FROM HEAD: data/verdicts.json has local modifications.")
        print("  Nothing here vouches for those bytes. Re-check out the file before trusting this run.")
        failures += 1
    if newest_all:
        try:
            head_n, head_sha = head_corpus_count()
            anchored_n = len(json.loads(load_corpus_at_raw(newest_all)))
            if head_n != anchored_n:
                print(f"COVERAGE: HEAD ({head_sha}) serves {head_n} verdicts; the newest "
                      f"verified anchor covers {anchored_n}.")
                print(f"  {abs(head_n - anchored_n)} verdict(s) published since that anchor are "
                      f"covered by NO anchor yet.")
        except subprocess.CalledProcessError:
            pass

    verdict = "FAIL" if failures else ("INCOMPLETE" if skipped else "OK")
    print(f"{verdict}: {checked} anchor(s) verified, {failures} failure(s), "
          f"{skipped} unverified")
    if uncovered:
        # In the headline block deliberately. A reader who skims to the last line must not
        # come away thinking the file they hold is anchored when the newest verdicts in it
        # are not. Reported, not failed - see the module docstring.
        print(f"    - the {uncovered} newest verdicts in your checkout are not yet anchored")
    if skipped and not failures:
        print("  UNVERIFIED entries proved nothing. Do not read this as a pass.")
    if failures:
        return 1
    return 3 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
