// "Where's my file?" data for the Tier-1 helper. Typical config locations per
// client + OS. Paths vary by version; the UI says so. Values are static strings -
// no secrets, no I/O.

export type OS = 'mac' | 'win' | 'linux';

export interface PathHelp {
  readonly path: string;
  readonly reveal: string; // a command that opens/reveals the file or its folder
}

// reveal helpers per OS (given a path)
const reveal = (os: OS, p: string): string =>
  os === 'mac' ? `open -R "${p}"` : os === 'win' ? `explorer /select,"${p}"` : `xdg-open "$(dirname "${p}")"`;

type Table = Record<string, Partial<Record<OS, string>>>;

// Raw path templates. `~` and `%APPDATA%` are shown as-is (users know their own home).
const PATHS: Table = {
  'Claude Desktop': {
    mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
    win: '%APPDATA%\\Claude\\claude_desktop_config.json',
    linux: '~/.config/Claude/claude_desktop_config.json',
  },
  Cursor: {
    mac: '~/.cursor/mcp.json',
    win: '%USERPROFILE%\\.cursor\\mcp.json',
    linux: '~/.cursor/mcp.json',
  },
  'VS Code': {
    mac: '.vscode/mcp.json  (in your project) - or the "mcp" block in settings.json',
    win: '.vscode\\mcp.json  (in your project) - or the "mcp" block in settings.json',
    linux: '.vscode/mcp.json  (in your project) - or the "mcp" block in settings.json',
  },
  Cline: {
    mac: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    win: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json',
    linux: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
  },
  Windsurf: {
    mac: '~/.codeium/windsurf/mcp_config.json',
    win: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json',
    linux: '~/.codeium/windsurf/mcp_config.json',
  },
};

export const CLIENTS: readonly string[] = Object.keys(PATHS);

export function pathHelp(client: string, os: OS): PathHelp | null {
  const p = PATHS[client]?.[os];
  if (!p) return null;
  // For the VS Code composite string, the reveal command targets only the real path segment.
  const bare = p.split('  ')[0];
  return { path: p, reveal: reveal(os, bare) };
}
