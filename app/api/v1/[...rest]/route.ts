// JSON 404 for any /api/v1 path no other route claims. Without it an API client that
// mistypes a path (or calls /api/v1/trust without its segments) receives the site's HTML 404
// page, which a JSON parser reports as a syntax error rather than "no such endpoint".
// More specific routes always win over this catch-all.

function notFound(): Response {
  return Response.json(
    { error: 'not_found', docs: 'https://mcpindex.ai/openapi.json' },
    { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}

export const GET = notFound;
export const POST = notFound;
