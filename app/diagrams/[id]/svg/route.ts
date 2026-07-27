import { renderDiagram } from '@/components/diagrams';
import { getDiagram, DIAGRAM_LICENSE_URL } from '@/lib/diagrams';
import { getServerCount, getCategoryCount } from '@/lib/registry';

export const revalidate = 86400;

/**
 * The standalone figure, as image/svg+xml.
 *
 * WHY A ROUTE AND NOT A BUILD STEP
 * A build script that writes public/diagrams/*.svg is a second copy of every figure, and a
 * second copy is a staleness surface - the exact failure this repo already paid for once when
 * census figures were hand-copied and contradicted their own DOI for four days. Rendering the
 * SAME component here means the downloadable SVG cannot disagree with the one on the page:
 * there is only one source.
 *
 * Serving vector (not raster) is also what a reuser actually wants - editable, scalable, and
 * indexable by image search. next/og cannot render these figures anyway: Satori supports a
 * flexbox subset, not arbitrary SVG.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const d = getDiagram(id);
  if (!d) return new Response('Not found', { status: 404 });

  const [servers, categories] = await Promise.all([getServerCount(), getCategoryCount()]);
  const node = renderDiagram(id, {
    servers: servers.toLocaleString('en-US'),
    categories: String(categories),
  });
  if (!node) return new Response('Not found', { status: 404 });

  // Imported lazily: Next's RSC graph rejects a static react-dom/server import, and this is a
  // route handler (never a component), so the renderer is only ever reached on a request for
  // the standalone file. Keeping it here rather than pre-generating the SVG in a build step is
  // deliberate - a second copy of a figure is a second thing that can go stale.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const inner = renderToStaticMarkup(node);
  // Attribution travels WITH the file: a reuser who saves the SVG and loses the page still has
  // the licence and the source. Comment, not markup, so it never renders over the figure.
  const credit = `<!-- "${d.title}" - ${d.claim} Source: https://mcpindex.ai/diagrams/${d.id} Licence: ${DIAGRAM_LICENSE_URL} -->`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n${credit}\n${inner}\n`;

  return new Response(body, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      // Reuse is the point: let anyone hotlink or fetch it cross-origin.
      'access-control-allow-origin': '*',
      'x-license': DIAGRAM_LICENSE_URL,
    },
  });
}
