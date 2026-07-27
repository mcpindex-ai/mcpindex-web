import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { browsePage } from '@/lib/serversBrowse';
import { ServersBrowse } from '@/components/ServersBrowse';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'All MCP servers · browse the full index A-Z',
  description:
    'Every MCP server mcpindex indexes - the official registry snapshot plus a small editorially admitted set - alphabetized and paginated. Each entry links its verdict page.',
  alternates: { canonical: 'https://mcpindex.ai/servers' },
};

export default async function ServersIndex() {
  const servers = await loadServers();
  const data = browsePage(servers, 1);
  if (!data) throw new Error('browsePage(1) cannot be out of range');
  return <ServersBrowse data={data} />;
}
