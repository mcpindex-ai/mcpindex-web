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


def ots_attested_heights(proof: Path, chain_root: str) -> list[int] | None:
    """Block heights the proof genuinely attests, or None when we cannot tell.

    NONE IS NOT ZERO AND NOT OK. The caller must treat None as unverified.

    This deliberately does NOT hand-parse the .ots container. The first version of this
    function scanned the raw bytes for an 8-byte attestation tag and decoded a varint, and
    a 12-byte file consisting of nothing but that tag and a number was reported as
    `proof attests block(s) [959933]` - no magic header, no merkle path, no binding to the
    root at all. That is the same laundering this script exists to stop, rebuilt one layer
    down and made more convincing by an affirmative "ok".

    The library does the two things that actually matter and a byte-scan cannot: it parses
    the container structurally (so trailing or prepended garbage is rejected), and it binds
    `file_digest` to sha256 of the stamped preimage - which is what ties this proof to THIS
    anchor rather than to any anchor.
    """
    try:
        from opentimestamps.core.notary import BitcoinBlockHeaderAttestation
        from opentimestamps.core.serialize import BytesDeserializationContext
        from opentimestamps.core.timestamp import DetachedTimestampFile
    except ImportError:
        return None
    # Real proofs are ~1.8 KB. The library's read_varuint has an unbounded shift, so a
    # multi-megabyte .ots costs minutes of CPU in bigint shifts - the same quadratic DoS the
    # hand-rolled parser had, inherited. 64 KB is 35x headroom and bounds the parse.
    if proof.stat().st_size > 65536:
        raise ValueError(f"proof is implausibly large ({proof.stat().st_size} bytes)")
    try:
        ctx = BytesDeserializationContext(proof.read_bytes())
        dtsf = DetachedTimestampFile.deserialize(ctx)
    except Exception:
        raise ValueError("proof is not a well-formed OpenTimestamps file")
    # The stamped bytes are the ASCII string "sha256:<hex>", not the raw digest.
    if dtsf.file_digest != hashlib.sha256(chain_root.encode("utf-8")).digest():
        raise ValueError("proof does not commit to this anchor's chain_root")
    return [
        int(att.height)
        for _, att in dtsf.timestamp.all_attestations()
        if isinstance(att, BitcoinBlockHeaderAttestation)
    ]


def orphaned_proofs(referenced: set[str]) -> list[str]:
    """Proof files on disk that no ledger entry points at.

    This is what catches the two tampers every self-consistency check misses. A truncated
    or rewritten ledger is internally perfect - an attacker recomputes seq, prev_root,
    chain_root and the proof path together - but they cannot easily remove the ORPHANED
    .ots files left behind in the same publication. A proof nothing references is either a
    deleted anchor or a ledger that has been rewritten around it.
    """
    d = REPO / "public" / "anchors"
    if not d.is_dir():
        return []
    # repr() on output: a filename is attacker-chosen, and one containing ANSI escapes can
    # clear the reader's screen and forge a line in this script's own verdict format.
    return sorted(
        f"anchors/{p.name}" for p in d.glob("*.ots")
        if f"anchors/{p.name}" not in referenced
    )


def head_corpus_count() -> tuple[int, str]:
    """(verdict count, short sha) of data/verdicts.json at HEAD, for the coverage report."""
    sha = subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"],
                         capture_output=True, text=True, check=True).stdout.strip()
    n = len(json.loads(load_corpus_at_raw(sha)))
    return n, sha[:12]


def working_tree_matches_head() -> bool | None:
    """True/False when comparable; None when this is not a git checkout.

    None for the reader who downloaded the ZIP rather than cloning - they have no history
    to compare against. That is unverified, not fine, and certainly not a traceback.
    """
    # BYTE compare, deliberately. `git diff --quiet` would apply clean/smudge filters and
    # look friendlier to a Windows reader, but a hostile publisher controls .gitattributes,
    # and an `ident` filter would then let "$Id: MALICIOUS $" on disk compare clean against
    # "$Id$" at HEAD while the parsed JSON differs. The CRLF false-positive is closed the
    # honest way instead: `data/verdicts.json -text` in .gitattributes.
    try:
        disk = (REPO / VERDICTS_REL).read_bytes()
        head = subprocess.run(
            ["git", "-C", str(REPO), "show", "HEAD:" + VERDICTS_REL],
            capture_output=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None
    return disk == head


# A full commit sha and nothing else. This runs on the READER's machine against a ledger
# they downloaded, so validation upstream in the producing repo cannot protect them - the
# attacker's edit target is the published file this script reads. `git show` accepts any
# revision, so an unpinned value like "HEAD" would silently resolve to whatever the reader
# has checked out and print `root ok` against it: laundering, by the tool built to stop it.
_COMMIT_RE = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")



# Shapes every ledger string must match before it is allowed near an f-string.
_SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}")
_PROOF_RE = re.compile(r"anchors/[0-9a-f]{64}\.ots")
_STAMP_RE = re.compile(r"[0-9T:.Z+-]{10,40}")


def safe(value: object, shape: re.Pattern[str] | None = None) -> str:
    """Render a LEDGER-DERIVED string for the terminal. Never use an f-string directly.

    The ledger is the artifact under attack, and its strings were printed raw. A
    `stamped_at` of "\x1b[8m..." turns on terminal conceal, and with a few more escapes a
    ledger whose real result is FAIL renders on screen as a clean OK - the verifier made to
    lie about its own verdict, while the exit code says otherwise and nobody looks.

    Orphan filenames got `!r` two commits ago for exactly this reason; the ledger's own
    fields, which are more numerous and equally attacker-chosen, did not. Same class, same
    fix, applied consistently this time. Mirrors _scrub_subprocess_text in
    mcpindex-trust/src/trust/_ots_helpers.py, which exists for the identical reason.
    """
    text = str(value)
    if shape is not None and shape.fullmatch(text):
        return text
    # Anything unexpected is quoted, so control bytes are escaped rather than executed.
    return repr(text)


def load_corpus_at_raw(commit: str) -> bytes:
    if not _COMMIT_RE.fullmatch(commit):
        raise ValueError(f"corpus_commit is not a full commit sha: {commit[:32]!r}")
    return subprocess.run(
        # No --end-of-options: it needs git 2.24+, and on older git the unrecognized flag
        # exits 128, which this script's caller misreports as "commit absent". _COMMIT_RE
        # above already rejects every option shape, so the flag bought nothing and cost
        # a wrong diagnosis for readers on older toolchains.
        ["git", "-C", str(REPO), "show", f"{commit}:{VERDICTS_REL}"],
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
    needs_node = 0
    newest_all: str | None = None
    referenced: set[str] = set()
    for e in ledger["anchors"]:
        missing = [k for k in ("seq", "root", "chain_root", "proof", "stamped_at",
                               "verdict_count") if k not in e]
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

        print(f"anchor #{safe(e['seq'])}  (stamped {safe(e.get('stamped_at', ''), _STAMP_RE)})")
        for label, ok, detail in (
            ("chain_root", chain_ok, f"expected {want_chain}"),
            ("seq", seq_ok, f"expected {want_seq}"),
            ("prev_root", prev_ok, "does not point at the preceding anchor"),
            ("proof path", proof_ok, f"expected anchors/{hexed}.ots"),
        ):
            if ok:
                print(f"  {label:<11} ok")
            else:
                print(f"  {label:<11} FAIL  {safe(detail)}"); failures += 1

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
                print(f"  corpus      UNVERIFIED  commit {safe(commit[:12])} absent "
                      f"(shallow clone? try: git fetch --unshallow)")
                skipped += 1
                raw = None
            if raw is not None:
                verdicts = json.loads(raw)
                got = corpus_root(verdicts)
                if got == e["root"]:
                    print(f"  root        ok    {safe(got, _SHA256_RE)}  @ {safe(commit[:12])}")
                    newest_anchored = commit
                else:
                    print(f"  root        FAIL  got {safe(got, _SHA256_RE)}\n                    want {safe(e['root'], _SHA256_RE)}")
                    failures += 1
                # verdict_count is rendered on /trust as fact; assert it rather than echo it.
                if len(verdicts) != e["verdict_count"]:
                    print(f"  count       FAIL  ledger says {safe(e['verdict_count'])}, "
                          f"corpus has {len(verdicts)}")
                    failures += 1
                else:
                    print(f"  count       ok    {safe(e['verdict_count'])} verdicts")

        blocks = (e.get("bitcoin") or {}).get("block_heights") or []
        proof_path = REPO / "public" / e["proof"]
        referenced.add(e["proof"])
        if blocks:
            if not proof_ok:
                print("  bitcoin     FAIL  proof path is not pinned to this anchor")
                failures += 1
            elif not proof_path.is_file():
                print(f"  bitcoin     FAIL  ledger claims block(s) {safe(blocks)} but "
                      f"public/{safe(e['proof'], _PROOF_RE)} is missing"); failures += 1
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
                    elif not all(isinstance(b, int) for b in blocks):
                        print(f"  bitcoin     FAIL  ledger block_heights are not "
                              f"integers: {safe(blocks)}"); failures += 1
                    elif sorted(attested) != sorted(blocks):
                        print(f"  bitcoin     FAIL  proof attests {safe(attested)}, "
                              f"ledger claims {safe(blocks)}"); failures += 1
                    else:
                        # NOT "ok", and NOT "attests". The library confirms the proof is
                        # well-formed and commits to THIS anchor's chain_root - which is
                        # real, and stops a genuine proof being reused under another
                        # anchor's name. It does NOT confirm the block. all_attestations()
                        # returns what the file SAYS; a 78-byte file with the right
                        # file_digest and a fabricated attestation passes it. Confirming
                        # the block needs a merkle path check against a real header, which
                        # needs a node - and this script promises not to phone home.
                        print(f"  bitcoin     PARTIAL  structure ok, binds to this anchor; "
                              f"block(s) {safe(attested)} is the proof's own CLAIM")
                        # Folded into `skipped`, so the verdict word becomes INCOMPLETE
                        # and the exit becomes 3. My earlier reasoning - that a
                        # permanently non-zero exit cries wolf - conflated NON-ZERO with
                        # ALARM. Exit 1 is the alarm channel and stays quiet here; exit 3
                        # already means "could not check" and is ALREADY permanent for
                        # every ZIP reader and every reader without the library. Routing
                        # this there costs no new fatigue, and the split it replaces was
                        # backwards: a reader WITHOUT the library got INCOMPLETE, while a
                        # reader WITH it who learned the claim was unconfirmable got OK.
                        # The tool was more reassuring the more it knew.
                        needs_node += 1
                        skipped += 1
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
                print(f"  {o!r}")
            print("  A published proof with no ledger entry means anchors were removed or")
            print("  the chain was rewritten around them. The remaining ledger can still be")
            print("  perfectly self-consistent; this is the evidence that it is not complete.")
            failures += len(orphans)

    matches = working_tree_matches_head()
    if matches is False:
        disk = (REPO / VERDICTS_REL).read_bytes()
        try:
            head = subprocess.run(
                ["git", "-C", str(REPO), "show", "HEAD:" + VERDICTS_REL],
                capture_output=True, check=True,
            ).stdout
        except Exception:
            head = b""
        if head and disk.replace(b"\r\n", b"\n") == head:
            # Line-ending drift, not tampering. `.gitattributes -text` fixes fresh clones,
            # but a clone made BEFORE that attribute keeps CRLF on disk, and accusing that
            # reader of tampering is a false positive in the one channel that must never
            # cry wolf.
            print("WORKING TREE UNVERIFIED: data/verdicts.json differs from HEAD only by")
            print("  line endings (CRLF). Not tampering. Repair:")
            print("    git rm --cached data/verdicts.json && git reset --hard HEAD")
            skipped += 1
            matches = None
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
                uncovered = abs(head_n - anchored_n)
                print(f"COVERAGE: HEAD ({head_sha}) serves {head_n} verdicts; the newest "
                      f"anchor covers {anchored_n} at {newest_all[:12]}.")
        except (subprocess.CalledProcessError, ValueError, FileNotFoundError, OSError):
            # ValueError: a malformed corpus_commit already FAILed per-anchor above;
            # re-raising it here would replace the verdict with a traceback.
            # FileNotFoundError: no git binary. Both must degrade, not crash.
            pass

    verdict = "FAIL" if failures else ("INCOMPLETE" if skipped else "OK")
    print(f"{verdict}: {checked} anchor(s) checked, {failures} failure(s), "
          f"{skipped} unverified")
    if needs_node:
        # Deliberately NOT part of `skipped`: it can never be satisfied by this script, and
        # a permanently non-zero exit is a wolf-cry that teaches readers to ignore the one
        # channel reporting real tampering. Same call as coverage.
        print(f"    - {needs_node} proof(s) carry a Bitcoin block CLAIM this script cannot")
        print(f"      confirm offline. To finish the job (needs a node):")
        print(f"        printf 'sha256:%s' <chain_root_hex> > root.txt")
        print(f"        ots verify -f root.txt public/anchors/<chain_root_hex>.ots")
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
