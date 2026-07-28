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


def load_corpus_at(commit: str | None) -> dict:
    """verdicts.json as of `commit`, or the working copy when the entry predates the field."""
    if not commit:
        return json.loads((REPO / VERDICTS_REL).read_text())
    out = subprocess.run(
        ["git", "-C", str(REPO), "show", f"{commit}:{VERDICTS_REL}"],
        capture_output=True, check=True,
    ).stdout
    return json.loads(out)


def ots_attested_heights(proof: Path) -> list[int]:
    """Block heights a .ots proof actually asserts, read straight from the file.

    Parses the OpenTimestamps op-tape rather than shelling to `ots`, so this stays
    dependency-free. We are not validating the merkle path here - that needs a Bitcoin node -
    only reading which heights the file CLAIMS, so the ledger cannot claim a different one.
    A ledger asserting block 959980 over a proof that says 959893 is a forgery this catches.
    """
    b = proof.read_bytes()
    # BitcoinBlockHeaderAttestation tag, per the OTS spec.
    TAG = bytes([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01])
    out: list[int] = []
    i = 0
    while (i := b.find(TAG, i)) != -1:
        j = i + len(TAG)
        if j >= len(b):
            break
        j += 1  # length-prefixed payload; skip the length byte
        # varint height
        height, shift = 0, 0
        while j < len(b):
            c = b[j]; j += 1
            height |= (c & 0x7F) << shift
            if not c & 0x80:
                break
            shift += 7
        out.append(height)
        i = j
    return out


def head_corpus_count() -> tuple[int, str]:
    """(verdict count, short sha) of data/verdicts.json at HEAD, for the coverage report."""
    sha = subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"],
                         capture_output=True, text=True, check=True).stdout.strip()
    n = len(json.loads(load_corpus_at_raw(sha)))
    return n, sha[:12]


def working_tree_matches_head() -> bool:
    """True when data/verdicts.json on disk is byte-identical to HEAD's."""
    disk = (REPO / VERDICTS_REL).read_bytes()
    return disk == load_corpus_at_raw("HEAD")


def load_corpus_at_raw(commit: str) -> bytes:
    return subprocess.run(
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
    for e in ledger["anchors"]:
        want_chain = chain_root(prev_chain, e["root"])
        chain_ok = want_chain == e["chain_root"]
        # Structural checks the producer enforces and the first version of this script
        # dropped. Each one alone lets a forgery through: a renumbered seq, a prev_root
        # pointing at nothing, or a proof path repointed at another anchor's file.
        seq_ok = e["seq"] == prev_seq + 1
        prev_ok = e.get("prev_root") == prev_root
        hexed = e["chain_root"].replace("sha256:", "")
        proof_ok = e["proof"] == f"anchors/{hexed}.ots"
        prev_chain, prev_root, prev_seq = e["chain_root"], e["root"], e["seq"]
        if args.seq is not None and e["seq"] != args.seq:
            continue
        checked += 1
        commit = e.get("corpus_commit")

        print(f"anchor #{e['seq']}  (stamped {e['stamped_at'][:19]}Z)")
        for label, ok, detail in (
            ("chain_root", chain_ok, f"expected {want_chain}"),
            ("seq", seq_ok, f"expected {prev_seq}"),
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
            except subprocess.CalledProcessError:
                print(f"  corpus      UNVERIFIED  commit {commit[:12]} absent "
                      f"(shallow clone? try: git fetch --unshallow)")
                skipped += 1
            else:
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
        if blocks:
            if not proof_path.is_file():
                print(f"  bitcoin     FAIL  ledger claims block(s) {blocks} but "
                      f"public/{e['proof']} is missing"); failures += 1
            else:
                attested = ots_attested_heights(proof_path)
                if not attested:
                    print(f"  bitcoin     FAIL  proof carries no Bitcoin attestation, "
                          f"ledger claims {blocks}"); failures += 1
                elif sorted(attested) != sorted(blocks):
                    print(f"  bitcoin     FAIL  proof attests {attested}, "
                          f"ledger claims {blocks}"); failures += 1
                else:
                    print(f"  bitcoin     ok    proof attests block(s) {attested}")
                    print(f"                confirm the merkle path yourself:")
                    print(f"                  printf 'sha256:%s' {hexed} > root.txt")
                    print(f"                  ots verify -f root.txt public/{e['proof']}")
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
    dirty = not working_tree_matches_head()
    if dirty:
        print("WORKING TREE DIFFERS FROM HEAD: data/verdicts.json has local modifications.")
        print("  Nothing here vouches for those bytes. Re-check out the file before trusting this run.")
        failures += 1
    if newest_anchored:
        try:
            head_n, head_sha = head_corpus_count()
            anchored_n = len(json.loads(load_corpus_at_raw(newest_anchored)))
            if head_n != anchored_n:
                print(f"COVERAGE: HEAD ({head_sha}) serves {head_n} verdicts; the newest "
                      f"verified anchor covers {anchored_n}.")
                print(f"  {abs(head_n - anchored_n)} verdict(s) published since that anchor are "
                      f"covered by NO anchor yet.")
        except subprocess.CalledProcessError:
            pass

    verdict = "FAIL" if failures else ("INCOMPLETE" if skipped else "OK")
    print(f"{verdict}: {checked} anchor(s) checked, {failures} failure(s), "
          f"{skipped} unverified")
    if skipped and not failures:
        print("  UNVERIFIED entries proved nothing. Do not read this as a pass.")
    return 1 if (failures or skipped) else 0


if __name__ == "__main__":
    sys.exit(main())
