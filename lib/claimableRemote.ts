/**
 * The origin an owner proves control of, or '' when the remote cannot be claimed.
 *
 * The owner verifier fetches https://<host>/.well-known/mcpindex-challenge. A templated host
 * (`https://{tenant}.example.ai`) has no single origin to serve it from, and the verifier
 * refuses a non-https remote, so offering either in the /claim picker sends the owner into a
 * step that cannot succeed.
 * Shared by the claimable finder and the wizard so the list and the button agree.
 */
export function claimableOrigin(url: string): string {
  if (/[{}]/.test(url)) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}
