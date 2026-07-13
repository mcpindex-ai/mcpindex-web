// Tier-0 sample data so a visitor with no config sees a full result instantly.
// A realistic mixed toolset that exercises every blast-radius outcome, plus a
// sample config string for the paste placeholder.

import type { ToolDef } from './vendor/preflight-types';

export const SAMPLE_TOOLS: ToolDef[] = [
  {
    name: 'read_file',
    description: 'Read a file from the local filesystem and return its contents.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_directory',
    description: 'List the entries in a directory.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    name: 'search_docs',
    description: 'Search indexed documents and return matching passages.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'postgres_query',
    description: 'Run a SQL query and return matching rows.',
    inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating or overwriting it.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'update_record',
    description: 'Update a record in the store.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, body: { type: 'string' } } },
    // Contradiction: declares read-only, but the action is a write.
    annotations: { readOnlyHint: true },
  },
  {
    name: 'slack_send_message',
    description: 'Send a message to a Slack channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, message: { type: 'string' } },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from disk.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'stripe_create_charge',
    description: 'Create a payment charge against a customer.',
    inputSchema: {
      type: 'object',
      properties: { customer: { type: 'string' }, amount: { type: 'number' } },
      required: ['customer', 'amount'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command and return stdout.',
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
];

export const SAMPLE_CONFIG_JSON = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/code"]
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http"
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp"],
      "env": { "STRIPE_SECRET_KEY": "sk_live_..." }
    }
  }
}`;
