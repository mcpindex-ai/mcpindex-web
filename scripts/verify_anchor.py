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
    failures = 0
    checked = 0
    for e in ledger["anchors"]:
        want_chain = chain_root(prev_chain, e["root"])
        chain_ok = want_chain == e["chain_root"]
        prev_chain = e["chain_root"]
        if args.seq and e["seq"] != args.seq:
            continue
        checked += 1
        commit = e.get("corpus_commit")

        print(f"anchor #{e['seq']}  ({e['verdict_count']} verdicts, stamped {e['stamped_at'][:19]}Z)")
        if not chain_ok:
            print(f"  chain_root  FAIL  expected {want_chain}"); failures += 1
        else:
            print(f"  chain_root  ok    {e['chain_root']}")

        if not commit:
            print("  corpus      SKIP  entry predates corpus_commit; cannot pin the snapshot")
        else:
            try:
                got = corpus_root(load_corpus_at(commit))
            except subprocess.CalledProcessError:
                print(f"  corpus      SKIP  commit {commit[:12]} not in this clone "
                      f"(try: git fetch --unshallow)")
            else:
                if got == e["root"]:
                    print(f"  root        ok    {got}  @ {commit[:12]}")
                else:
                    print(f"  root        FAIL  got {got}\n                    want {e['root']}")
                    failures += 1

        blocks = (e.get("bitcoin") or {}).get("block_heights") or []
        hexed = e["chain_root"].replace("sha256:", "")
        if blocks:
            print(f"  bitcoin     claims block(s) {blocks} - confirm it yourself:")
            print(f"                ots info public/anchors/{hexed}.ots        # offline, no node")
            print(f"                printf 'sha256:%s' {hexed} > root.txt")
            print(f"                ots verify -f root.txt public/anchors/{hexed}.ots   # needs a Bitcoin node")
        else:
            print("  bitcoin     pending (stamped, not yet confirmed on-chain)")
        print()

    if not checked:
        print("no matching anchor", file=sys.stderr)
        return 2
    print(f"{checked} anchor(s) checked, {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
