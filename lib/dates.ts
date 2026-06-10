// Tiny shared date formatters for blob-sourced ISO timestamps (used by the ledger page and the
// per-server ContractDrift section). Both render NOTHING for a missing/invalid value - never
// "Invalid Date", and never the raw string (an operator-controlled blob must not paint arbitrary
// text on a date line).

/** Full UTC string, e.g. "Tue, 10 Jun 2026 16:00:00 GMT". */
export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

/** Date-only, e.g. "2026-06-10". */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
