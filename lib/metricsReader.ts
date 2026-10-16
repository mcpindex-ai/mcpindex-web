// Who may read the internal metrics routes (app/api/metrics/*): the agent factory on GB's Studio.
//
// The factory holds a random 256-bit token in its macOS Keychain (item
// factory/mcpindex_metrics-mcpindex) and sends it as a bearer token. Only the token's sha256 lives
// here. A hash of 256 random bits cannot be turned back into the token, so committing it costs
// nothing and keeps a reader secret out of the Vercel environment. To rotate: store a new token in
// the factory Keychain and replace READER_TOKEN_SHA256 in the same change.

import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

export const READER_TOKEN_SHA256 = 'a2ae8de90efa8f01f1dd5c2aafa796995110c9c3974bbe3a9bc949237388c059';

let readerHash = READER_TOKEN_SHA256;

/** TEST-ONLY seam: the hash route tests accept. `undefined` restores the committed one. */
export function __setReaderHashForTest(hex: string | undefined): void {
  readerHash = hex ?? READER_TOKEN_SHA256;
}

/** True when `header` is `Bearer <token>` and sha256(token) is the reader's hash. Both sides are
 *  32-byte digests, so timingSafeEqual never sees a length mismatch. */
export function metricsReaderAuthorized(header: string | null, wantHex: string = readerHash): boolean {
  if (!header) return false;
  const m = /^Bearer ([^\s,]{1,256})$/.exec(header);
  if (!m) return false;
  const got = createHash('sha256').update(m[1]!, 'utf8').digest();
  const want = Buffer.from(wantHex, 'hex');
  if (want.length !== got.length) return false;
  return timingSafeEqual(got, want);
}
