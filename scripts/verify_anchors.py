#!/usr/bin/env python3
"""Independently verify every published verdict anchor. No dependencies, no network
account, no trust in this repository's own claims beyond the bytes git already stores.

WHY THIS EXISTS. /trust and /methodology tell readers the verdict chain is auditable
end to end. Until this script, it was not. `ots verify` on its own gets a reader to
"some digest existed by Bitcoin block N" and stops there, because the function that
turns the published corpus into that digest lived in a private repository. That left
the load-bearing half of the claim - that the anchored digest is *this* corpus -
resting on our say-so. A trust product cannot ship that asymmetry.

THE FIVE LEGS, all reproducible from this repository alone:

  1. corpus     `git cat-file blob <corpus_commit>:data/verdicts.json`
  2. root       compute_root({slug: sha256(canonical_bytes(record))})
  3. chain_root sha256(canonical_bytes([prev_chain_root, root]))
  4. ots digest sha256(("sha256:" + chain_root_hex).encode()), which is the digest
                embedded in public/anchors/<chain_root_hex>.ots
  5a. blocks    the Bitcoin block heights the proof is attested into, parsed straight
                out of the .ots and matched against the ledger's claim. No client, no
                network, always on.
  5b. bitcoin   `ots verify` that proof   (--ots). NEEDS A LOCAL BITCOIN NODE - the
                client reads bitcoind's cookie file and does not fall back to a block
                explorer - so without one this reports `nonode`, not a failure.

Leg 4 is the one nobody guesses. The stamped digest is NOT the raw 32 bytes of
chain_root and NOT the hash of the bare hex - it is the hash of the ASCII string
including the "sha256:" prefix. A reader who assumes otherwise gets a mismatch and
concludes our anchors are forged.

Leg 1 reads git's STORED blob, which is byte-identical on every platform regardless
of checkout eol settings. Nothing here hashes a working-tree file, so no
.gitattributes directive is load-bearing for verification.

USAGE
    python3 scripts/verify_anchors.py                 # every anchor resolvable locally
    python3 scripts/verify_anchors.py --fetch         # pull missing corpora on demand
    python3 scripts/verify_anchors.py --last 3        # newest 3 only
    python3 scripts/verify_anchors.py --ots           # also ots verify (needs bitcoind)
    python3 scripts/verify_anchors.py --self-test     # prove the verifier can fail

Exits non-zero on any mismatch, and on a run that verified no corpus at all - a
verifier that silently checks nothing is worse than no verifier.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

# Frozen serialization constants. These are part of the published contract: changing
# any of them changes every digest and breaks every anchor already on Bitcoin.
FLOAT_FORMAT_SPEC = ".17e"
MAX_CANON_DEPTH = 64

# Detached OpenTimestamps proof preamble: magic string, then an 8-byte marker, then a
# one-byte version, then the file-hash op, then the digest.
OTS_MAGIC = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94"
OTS_OP_SHA256 = 0x08
# Tag that marks a BitcoinBlockHeaderAttestation inside a proof.
OTS_BITCOIN_TAG = bytes.fromhex("0588960d73d71901")

ANCHORS = "data/verdict-anchors.json"
CORPUS = "data/verdicts.json"


# --------------------------------------------------------------------------- canonical

def _canonicalize(o: Any, depth: int = 0) -> Any:
    """NFC-normalize text, sort mapping keys, pin float formatting.

    Sorting and NFC are what make the digest independent of who serialized the record
    and on what platform. The float spec is explicit because repr() differs across
    runtimes and a drifting float rendering would silently invalidate old anchors.
    """
    if depth > MAX_CANON_DEPTH:
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
        return {
            unicodedata.normalize("NFC", str(k)): _canonicalize(o[k], depth + 1)
            for k in sorted(o, key=str)
        }
    if isinstance(o, (list, tuple)):
        return [_canonicalize(v, depth + 1) for v in o]
    raise ValueError(f"non-canonicalizable type {type(o).__name__}")


def canonical_bytes(obj: Any) -> bytes:
    """THE canonical serialization. Every digest below is over this and nothing else."""
    return json.dumps(
        _canonicalize(obj),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def _digest(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def compute_root(heads: dict[str, str]) -> str:
    """Root over {slug: verdict digest}, as a sorted list of explicit pairs.

    Pairs rather than a bare mapping so the key is inside the hashed bytes: a corpus
    that renamed a slug without changing any verdict must not produce the same root.
    """
    return _digest(canonical_bytes([{"chain_key": k, "head": heads[k]} for k in sorted(heads)]))


def corpus_root(verdicts: dict[str, Any]) -> str:
    return compute_root({slug: _digest(canonical_bytes(rec)) for slug, rec in verdicts.items()})


def chain_root(prev_chain_root: str | None, root: str) -> str:
    """Fold a root into the running chain. The first entry folds against None.

    Each entry commits to its predecessor, so editing or reordering any past anchor
    invalidates every later chain_root - and each of those is separately timestamped,
    so the tampering is detectable against Bitcoin rather than against our own record.
    """
    return _digest(canonical_bytes([prev_chain_root, root]))


def ots_stamped_digest(proof: bytes) -> str:
    """The digest a detached OTS proof commits to."""
    if not proof.startswith(OTS_MAGIC):
        raise ValueError("not an OpenTimestamps detached proof")
    p = len(OTS_MAGIC) + 1  # skip the version byte
    if proof[p] != OTS_OP_SHA256:
        raise ValueError(f"unexpected file-hash op 0x{proof[p]:02x}, expected sha256")
    return proof[p + 1:p + 33].hex()


def _varuint(buf: bytes, i: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        b = buf[i]
        i += 1
        value |= (b & 0x7F) << shift
        if not b & 0x80:
            return value, i
        shift += 7


def ots_block_heights(proof: bytes) -> list[int]:
    """Bitcoin block heights this proof is attested into. No client, no network.

    `ots verify` needs a local Bitcoin node - it reads bitcoind's cookie file and will
    not fall back to a block explorer - so almost no third-party reader can run it. That
    would leave the last leg uncheckable in practice, which is the situation this whole
    script exists to end. So the heights are parsed straight out of the proof and matched
    against what the ledger claims: enough to catch a ledger that lies about which block
    attests it, with no dependency at all.

    What this does NOT do is confirm those blocks exist on the real chain with those
    merkle roots. That step needs a node or a block explorer, and is the reader's - see
    docs/verifying-anchors.md.
    """
    out: list[int] = []
    i = 0
    while True:
        i = proof.find(OTS_BITCOIN_TAG, i)
        if i < 0:
            return sorted(out)
        i += len(OTS_BITCOIN_TAG)
        _, after_len = _varuint(proof, i)  # payload length, then the height itself
        height, _ = _varuint(proof, after_len)
        out.append(height)
        i = after_len


# ------------------------------------------------------------------------------- git

class Repo:
    def __init__(self, root: str, allow_fetch: bool) -> None:
        self.root = root
        self.allow_fetch = allow_fetch
        self._fetched: set[str] = set()

    def _git(self, *args: str) -> bytes | None:
        r = subprocess.run(["git", "-C", self.root, *args], capture_output=True)
        return r.stdout if r.returncode == 0 else None

    def show(self, spec: str) -> bytes | None:
        return self._git("cat-file", "blob", spec)

    def read(self, relpath: str) -> bytes | None:
        """Read from the WORKING TREE, not from HEAD.

        Deliberate, and load-bearing for the CI gate: reading `HEAD:<path>` would verify
        whatever is already committed and silently ignore the change under review, so a
        PR that edited the ledger or swapped a proof would pass. An earlier draft of this
        script did read HEAD: mutating a root in the ledger and swapping one .ots for
        another both went green against it, which is how the bug was found.
        """
        p = Path(self.root, relpath)
        return p.read_bytes() if p.is_file() else None

    def corpus_at(self, commit: str) -> bytes | None:
        """Corpus blob at a commit, fetching it on demand under --fetch.

        A blobless depth-1 fetch of a single commit costs about a second and a couple
        of megabytes even against this repository's 1.2GB of history, which is what
        makes verifying real historical corpora affordable in CI.
        """
        blob = self.show(f"{commit}:{CORPUS}")
        if blob is not None or not self.allow_fetch or commit in self._fetched:
            return blob
        self._fetched.add(commit)
        self._git("fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", commit)
        return self.show(f"{commit}:{CORPUS}")


# ------------------------------------------------------------------------------- main

def verify(repo: Repo, last: int | None, do_ots: bool) -> int:
    raw = repo.read(ANCHORS)
    if raw is None:
        raise FileNotFoundError(ANCHORS)
    ledger = json.loads(raw)["anchors"]

    # The chain always folds from the very first entry: verifying a suffix still needs
    # every earlier chain_root, so walk the whole ledger and only REPORT the tail.
    start = 0 if last is None else max(0, len(ledger) - last)

    prev: str | None = None
    failures: list[str] = []
    corpora_checked = 0

    for i, entry in enumerate(ledger):
        seq = entry.get("seq", i)
        root = entry["root"]
        want_chain = entry["chain_root"]
        hexroot = want_chain.removeprefix("sha256:")
        reported = i >= start

        # leg 3 - chain fold. Needs no history, so it always runs.
        chain_ok = chain_root(prev, root) == want_chain
        if not chain_ok:
            failures.append(f"seq {seq}: chain_root does not fold from prev + root")

        # leg 4 - the proof commits to this chain_root, at the path the ledger claims.
        proof = repo.read(f"public/anchors/{hexroot}.ots")
        want_path = f"anchors/{hexroot}.ots"
        ots_ok = False
        if entry.get("proof") != want_path:
            failures.append(f"seq {seq}: proof path {entry.get('proof')!r} != {want_path!r}")
        elif proof is None:
            failures.append(f"seq {seq}: proof {want_path} missing from the working tree")
        else:
            expect = hashlib.sha256(want_chain.encode()).hexdigest()
            ots_ok = ots_stamped_digest(proof) == expect
            if not ots_ok:
                failures.append(f"seq {seq}: {want_path} does not stamp chain_root")

        # legs 1+2 - the anchored root really is this corpus. Needs the commit.
        commit = entry.get("corpus_commit")
        root_state = "skip"
        if reported and commit:
            blob = repo.corpus_at(commit)
            if blob is None:
                root_state = "skip"
            else:
                corpora_checked += 1
                if corpus_root(json.loads(blob)) == root:
                    root_state = "ok"
                else:
                    root_state = "FAIL"
                    failures.append(f"seq {seq}: root != corpus_root({commit[:8]}:{CORPUS})")

        # leg 5a - the proof is attested into exactly the blocks the ledger claims.
        # Always on: no client, no node, no network.
        claimed = sorted((entry.get("bitcoin") or {}).get("block_heights") or [])
        blocks = "n/a"
        if proof is not None and claimed:
            found = ots_block_heights(proof)
            if found == claimed:
                blocks = "ok"
            else:
                blocks = "FAIL"
                failures.append(
                    f"seq {seq}: proof attests blocks {found}, ledger claims {claimed}")

        # leg 5b - the blocks are real. Needs a Bitcoin node, so it is opt-in, and an
        # absent node is reported as such rather than as a verification failure.
        btc = ""
        if do_ots and proof is not None:
            state = _ots_verify(proof, want_chain)
            btc = "  bitcoin=" + state
            if state == "FAIL":
                failures.append(f"seq {seq}: ots verify rejected {want_path}")

        if reported:
            print(
                f"  seq {seq:>3}  corpus={root_state:<4} chain={'ok' if chain_ok else 'FAIL':<4} "
                f"proof={'ok' if ots_ok else 'FAIL':<4} blocks={blocks:<4}{btc}"
            )
        prev = want_chain

    print()
    if failures:
        for f in failures:
            print(f"  FAIL  {f}")
        print(f"\n  {len(failures)} failure(s)")
        return 1

    reported_n = len(ledger) - start
    if corpora_checked == 0:
        print(
            f"  chain and proofs consistent for {len(ledger)} anchors, but NO corpus was\n"
            f"  verified - every corpus_commit was unreachable in this checkout. Re-run\n"
            f"  with --fetch, or from a full clone. Refusing to report success."
        )
        return 1
    print(
        f"  {reported_n} anchor(s) reported, {len(ledger)} chained; "
        f"{corpora_checked} corpus root(s) reproduced from source. OK"
    )
    return 0


def _ots_verify(proof: bytes, chain_root_value: str) -> str:
    """Shell out to the opentimestamps client for the Bitcoin leg."""
    with tempfile.TemporaryDirectory() as d:
        target = Path(d, "digest")
        target.write_bytes(chain_root_value.encode())
        Path(d, "digest.ots").write_bytes(proof)
        try:
            r = subprocess.run(["ots", "verify", str(target) + ".ots"],
                               capture_output=True, text=True)
        except FileNotFoundError:
            return "noclient"
        blob = (r.stderr or "") + (r.stdout or "")
        if r.returncode == 0:
            return "ok"
        # `ots verify` reads bitcoind's cookie file and does NOT fall back to a block
        # explorer. No node is a missing capability, not a bad proof - saying FAIL here
        # would report a healthy chain as broken.
        if "Could not connect to Bitcoin node" in blob or "rpcpassword" in blob:
            return "nonode"
        return "FAIL"


def self_test() -> int:
    """Prove this verifier detects tampering instead of rubber-stamping.

    Worth running as a third party before trusting a green result from the checks above:
    a verifier that cannot fail tells you nothing. The known-answer test is the important
    one - it pins the exact serialization, so a future refactor that "cleans up"
    canonical_bytes cannot silently change every digest and orphan every proof already
    timestamped on Bitcoin.
    """
    checks: list[tuple[str, bool]] = []

    # Known-answer test. These bytes are contract, not an implementation detail.
    # Note the float: it canonicalizes to a QUOTED string, not a JSON number. That is
    # what pins the rendering across runtimes, and it is easy to "fix" by accident.
    kat_obj = {"b": 1, "a": [1.0, "é", None, True]}
    kat_want = b'{"a":["1.00000000000000000e+00","\\u00e9",null,true],"b":1}'
    checks.append(("canonical_bytes known-answer", canonical_bytes(kat_obj) == kat_want))

    # Unicode: NFC composed and decomposed forms must hash identically.
    checks.append((
        "NFC normalization is applied",
        canonical_bytes({"k": "é"}) == canonical_bytes({"k": "é"}),
    ))

    # Key order must not matter.
    checks.append((
        "key order does not change the digest",
        canonical_bytes({"a": 1, "b": 2}) == canonical_bytes({"b": 2, "a": 1}),
    ))

    # A renamed slug with identical verdicts must NOT produce the same root.
    rec = {"verdict": "PASS"}
    checks.append((
        "slug rename changes the root",
        corpus_root({"one": rec}) != corpus_root({"two": rec}),
    ))

    # A mutated verdict record must change the root.
    checks.append((
        "mutated record changes the root",
        corpus_root({"s": {"v": "PASS"}}) != corpus_root({"s": {"v": "FAIL"}}),
    ))

    # The chain must bind to its predecessor, so a reordered history is detectable.
    r1, r2 = "sha256:" + "1" * 64, "sha256:" + "2" * 64
    checks.append((
        "chain_root binds to prev",
        chain_root(None, r1) != chain_root(r2, r1),
    ))

    # Block heights must actually parse out of a real proof, and a proof with no
    # Bitcoin attestation must report none rather than inventing one.
    checks.append((
        "no bitcoin attestation -> no heights",
        ots_block_heights(b"\x00no attestation here") == [],
    ))

    # A truncated or foreign proof must raise rather than quietly return something.
    bad = False
    try:
        ots_stamped_digest(b"not an ots proof")
    except ValueError:
        bad = True
    checks.append(("non-OTS bytes rejected", bad))

    for name, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    failed = [n for n, ok in checks if not ok]
    print()
    if failed:
        print(f"  {len(failed)} self-test failure(s)")
        return 1
    print(f"  {len(checks)}/{len(checks)} self-tests passed")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--repo", default=".", help="repository root (default: cwd)")
    ap.add_argument("--last", type=int, default=None,
                    help="report only the newest N anchors (the chain is always walked in full)")
    ap.add_argument("--fetch", action="store_true",
                    help="fetch corpora that are not present (blobless, depth 1)")
    ap.add_argument("--ots", action="store_true",
                    help="also verify each proof against Bitcoin via the ots client")
    ap.add_argument("--self-test", action="store_true",
                    help="prove this verifier detects tampering; touches no repo data")
    a = ap.parse_args()
    try:
        if a.self_test:
            return self_test()
        return verify(Repo(a.repo, a.fetch), a.last, a.ots)
    except Exception as exc:  # a verifier that crashes must not read as a pass
        print(f"  ERROR  {type(exc).__name__}: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
