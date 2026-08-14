# Verifying the verdict anchors

Every screening verdict mcpindex publishes is folded into a hash chain, and each link
in that chain is timestamped into the Bitcoin blockchain with
[OpenTimestamps](https://opentimestamps.org/). This document is how you check that
yourself, without taking our word for any of it.

If you only read one thing: run this from a clone of this repository.

```sh
python3 scripts/verify_anchors.py
```

No dependencies, no account, no network unless you ask for it. It exits non-zero if
anything fails to reproduce.

## What "verified" actually means here

`ots verify` on its own proves that *some* 32-byte digest existed before a given
Bitcoin block. On its own that is close to worthless: it says nothing about whether
that digest has anything to do with the verdicts on this site.

The claim worth checking is the whole chain:

> the digest that Bitcoin timestamped is the digest of *this* corpus of verdicts.

That requires five legs, and all five are reproducible from this repository alone.

| # | Leg | Where it comes from |
|---|-----|---------------------|
| 1 | corpus bytes | `git cat-file blob <corpus_commit>:data/verdicts.json` |
| 2 | `root` | `compute_root({slug: sha256(canonical_bytes(record))})` |
| 3 | `chain_root` | `sha256(canonical_bytes([prev_chain_root, root]))` |
| 4 | proof digest | `sha256(("sha256:" + chain_root_hex).encode())` |
| 5 | Bitcoin | `ots verify` on `public/anchors/<chain_root_hex>.ots` |

Each anchor record in `data/verdict-anchors.json` carries the `corpus_commit` that
leg 1 needs, and every one of them resolves in this public repository.

### Leg 4 is the one that trips people up

The digest inside the `.ots` proof is **not** the raw 32 bytes of `chain_root`, and
**not** the hash of the bare hex string. It is the sha256 of the ASCII string
*including* the `sha256:` prefix:

```python
hashlib.sha256(("sha256:" + chain_root_hex).encode()).hexdigest()
```

If you assume otherwise you will get a mismatch and conclude the anchors are forged.
They are not; you hashed the wrong thing. This is the single most important line in
this document.

### A note on line endings

Leg 1 reads git's *stored* blob, not a file on disk. That is byte-identical on every
platform regardless of your `core.autocrlf` setting, so nothing here depends on
checkout behaviour and no `.gitattributes` directive is load-bearing for verification.

## The canonical serialization

Every digest above is taken over `canonical_bytes`, and nothing else:

```python
json.dumps(canonicalize(obj), sort_keys=True, separators=(",", ":"),
           ensure_ascii=True).encode("utf-8")
```

where `canonicalize` recursively:

- NFC-normalizes every string **and every mapping key**
- sorts mapping keys by their string form
- renders floats with `format(x, ".17e")` — note this produces a **quoted JSON string**,
  not a JSON number — and collapses `-0.0` to `0.0`
- renders datetimes as `%Y-%m-%dT%H:%M:%S.%fZ` in UTC
- rejects non-finite floats, and any type not listed above
- caps nesting depth at 64

These are frozen. Changing any of them changes every digest and invalidates every
proof already on Bitcoin.

`root` is taken over an explicit sorted list of pairs rather than a bare mapping:

```python
[{"chain_key": slug, "head": digest} for slug in sorted(...)]
```

so that a corpus which renamed a slug without changing any verdict does not produce
the same root.

## Running it

```sh
# every anchor whose corpus is already present locally
python3 scripts/verify_anchors.py

# fetch missing corpora on demand (blobless, depth 1 — about a second each)
python3 scripts/verify_anchors.py --fetch

# just the newest three
python3 scripts/verify_anchors.py --last 3 --fetch

# also verify against Bitcoin (needs `pip install opentimestamps-client`)
python3 scripts/verify_anchors.py --ots

# prove the verifier actually detects tampering rather than rubber-stamping
python3 scripts/verify_anchors.py --self-test
```

The chain is always walked from the first entry even when you only report a suffix —
`chain_root` folds from its predecessor, so a partial walk could not check it.

The script refuses to report success if it verified no corpus at all. On a shallow
clone with no `--fetch`, legs 3 and 4 still pass and it still exits non-zero, because
"the chain is internally consistent" is not the claim being made.

### Verify the verifier

You should not trust this script's green output just because we wrote it.
`--self-test` exercises the failure paths, including a known-answer test that pins the
exact serialization bytes. Beyond that, the useful move is to mutate something and
confirm it goes red:

```sh
# change any "root" in data/verdict-anchors.json, then:
python3 scripts/verify_anchors.py --last 2      # -> chain_root does not fold
```

An earlier draft of this script read the committed file instead of your working tree,
and that test passed when it should have failed. It now reads the working tree.

## In CI

`.github/workflows/web-ci.yml` runs `--self-test` plus `--last 3 --fetch` on every
push. It deliberately does not replay the whole ledger: checkout is depth-1 because
this repository's history is 1.2GB, and each historical corpus is a 25MB blob. The
full replay is a local operation.

## If verification fails

Open an issue with the failing `seq` and the script's output. A reproducible mismatch
against a Bitcoin-confirmed anchor is the most serious class of bug this project can
have, and it will be treated that way.
