// Single source of truth for URL safety across the guides surface.
//
// Rejects, in one place, every off-origin / injection form that can arrive in
// human-merged guide JSON (deep_link.href, next.href) or in guide-body markdown
// links (react-markdown urlTransform):
//   - javascript: / data: / other non-http(s) schemes
//   - protocol-relative "//host" and "/\host" (browsers resolve both off-origin)
//   - control-char-obfuscated variants: browsers strip ASCII TAB/LF/CR before
//     parsing a URL, so "/\t/evil.com" re-forms as "//evil.com" and would be a
//     latent open redirect if only index 1 were inspected.
// Same-origin paths ("/ledger", "/docs#x") and explicit http(s) URLs pass.

// ASCII control chars (0x00-0x1F, 0x7F). Browsers strip TAB/LF/CR mid-URL, so any
// control char before the origin can obfuscate a protocol-relative bypass.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Structured hrefs (deep_link.href, next.href): a same-origin path or http(s) URL only. */
export function isSafeHref(href: string): boolean {
  if (CONTROL_CHARS.test(href)) return false;
  if (href.startsWith('/')) return !/^\/[/\\]/.test(href); // reject //host and /\host
  return /^https?:\/\//i.test(href);
}

/**
 * Markdown link/image hrefs in prose (react-markdown `urlTransform`): as
 * isSafeHref, plus in-page "#fragment" and "mailto:". Returns '' to DROP an
 * unsafe url (react-markdown then renders no href), rather than passing it through.
 */
export function safeMarkdownUrl(url: string): string {
  if (CONTROL_CHARS.test(url)) return '';
  if (url.startsWith('#')) return url;
  if (/^mailto:/i.test(url)) return url;
  return isSafeHref(url) ? url : '';
}
