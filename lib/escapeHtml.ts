// One shared HTML entity escaper (third caller was the tipping point; see
// lib/badge.ts escapeXml and lib/brevo.ts for the two inline predecessors).
// Escapes all five entities so the result is safe in both text and attribute
// positions; callers need not know which position they are writing into.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
