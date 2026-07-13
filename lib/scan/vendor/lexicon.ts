// VENDORED VERBATIM from @mcp-index/sdk (mcpindex-trust/clients/ts/src/lexicon.ts @ ead501e,
// sha1 1517d4ab). Pure, no I/O, browser-safe. The SDK is the source of truth; the parity test
// (lib/scan/scan.test.ts) fails if the classifier output diverges. Do not edit the logic here.

/**
 * Pure side-effect / read-only NAME lexicon — a port of Python
 * `tooling/lexicon.py`. Stdlib-only, no I/O. Reused by `risk.ts`.
 */

const MUTATING_VERBS = new Set(
  (
    "write delete remove create update exec execute run post put patch " +
    "send drop destroy modify upload insert merge purge kill " +
    "authorize pay charge transfer refund withdraw deposit debit credit " +
    "settle fund purchase checkout subscribe cancel issue grant revoke " +
    "provision deploy set"
  ).split(" "),
);

const WORD_TOKEN_RE = /[a-z0-9]+/g;

const SIDE_EFFECT_INTENT = new Set(
  [
    "authorize", "payment", "pay", "charge", "transfer", "refund", "withdraw",
    "deposit", "mandate", "wallet", "checkout", "purchase", "order", "billing",
    "invoice", "subscribe", "fund", "settle", "debit", "credit", "transaction",
    "send", "create", "delete", "update", "write", "modify", "execute", "set",
    "remove", "cancel", "issue", "grant", "revoke", "provision", "deploy",
    "book", "reserve", "lock", "commit", "publish", "consume", "redeem",
    "dispatch", "release", "claim", "approve", "reject", "confirm", "submit",
    "schedule", "assign", "trigger", "archive", "terminate", "disable",
    "enable", "reset", "mark", "acknowledge", "ack", "sign", "escrow",
    "disburse", "wire", "place", "mint", "burn", "swap", "stake", "void",
    "purge", "truncate", "overwrite", "wipe", "prune",
  ],
);

/** snake_case + camelCase -> lowercase tokens (port of `_name_tokens`). */
export function nameTokens(name: string): Set<string> {
  const out = new Set<string>();
  for (const part of name.split(/[^A-Za-z0-9]+/)) {
    const matches = part.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g);
    if (matches) {
      for (const m of matches) out.add(m.toLowerCase());
    }
  }
  return out;
}

/** Third-person-singular -s/-es stems of a token (port of `_side_effect_stems`). */
export function sideEffectStems(word: string): Set<string> {
  const cands = new Set<string>([word]);
  for (const suf of ["es", "s"]) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      const root = word.slice(0, word.length - suf.length);
      cands.add(root);
      cands.add(root + "e");
    }
  }
  return cands;
}

function intersects(a: Set<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** True iff name/description carries a side-effecting/financial intent token
 * (base form or -s/-es inflection). Port of `_has_side_effect_intent`. */
export function hasSideEffectIntent(name: string, description: string): boolean {
  const text = `${name} ${description}`.toLowerCase();
  const words = new Set(text.match(WORD_TOKEN_RE) ?? []);
  for (const word of words) {
    if (intersects(sideEffectStems(word), SIDE_EFFECT_INTENT)) return true;
  }
  return false;
}

/** True iff the tool NAME carries a clearly-mutating verb. Port of
 * `_name_is_writeish` (name-only by design). */
export function nameIsWriteish(name: string): boolean {
  return intersects(nameTokens(name), MUTATING_VERBS) || hasSideEffectIntent(name, "");
}
