import { createHmac } from 'node:crypto';

// The drift fingerprint uses a PUBLIC global salt (shipped in the SDK + open-core preflight), so it
// is safe to compute server-side. Byte-identical to the trust crawl's drift_telemetry.server_fp:
//   HMAC-SHA256("mcpindex-drift-v1", server_id) hex, truncated to 16 bytes (32 hex chars).
// This lets us match the public ledger's per-event `server_fp` back to a NAMED registry server
// (server_id == the registry `server.name`). No secret here; this is not authentication.
const DRIFT_SALT = 'mcpindex-drift-v1';

/** Fingerprint a server id (the registry `server.name`) the way the crawl does, so the anonymized
 * ledger can be joined to a named server at the SERVER level. */
export function serverFp(serverId: string): string {
  return createHmac('sha256', DRIFT_SALT).update(serverId, 'utf8').digest('hex').slice(0, 32);
}
