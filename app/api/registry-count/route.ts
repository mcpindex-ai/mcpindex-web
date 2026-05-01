import { getServerCount, getCategoryCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const [servers, categories] = await Promise.all([
    getServerCount(),
    getCategoryCount(),
  ]);
  return Response.json(
    { servers, categories, source: 'registry.modelcontextprotocol.io' },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
