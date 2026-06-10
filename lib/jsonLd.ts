// Safely serialize an object for embedding in an inline <script type="application/ld+json">.
// JSON.stringify does NOT escape `</script>`, `<!--`, the ampersand, or the U+2028/U+2029
// line/paragraph separators - so a value sourced from the registry or any user/community content
// could break out of the script tag (stored XSS). Escape those characters as JSON \uXXXX (still
// valid JSON-LD, round-trips to the original) so a payload can never close the tag.
//
// The U+2028/U+2029 code points are referenced numerically (String.fromCharCode) so this source
// file contains no invisible literal separators.
const DANGEROUS = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(
    DANGEROUS,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
