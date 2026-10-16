import { homedir } from 'node:os';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { type Agent, buildServer, VERSION as TOOLS_VERSION } from '@scrawlnotes/agent';
import { loadMe } from '@scrawlnotes/core';
import { NodeFs } from './nodefs';
import { type FoundVault, settingsFile, spacesOf, vaultsFromFolders, vaultsFromSettings } from './vaults';

// `scrawl-mcp`: Scrawl for an agent on this computer, over stdio. Run with no arguments it reads
// the desktop app's settings and serves what the app sees; given folders, it serves those. The
// client (Claude Code, Codex, Claude Desktop, Cursor) starts it and talks to it on stdin and stdout;
// everything else goes to stderr. See design/agent.md, 6.

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const HELP = `scrawl-mcp ${VERSION}: Scrawl for agents, over stdio (MCP).

Usage: scrawl-mcp [folder ...] [--vault <folder>] [--client <name>]

With no folder, the spaces the Scrawl desktop app is set to on this computer: its settings file
says where the personal vault and the copies of your spaces are. With folders, each one is a
space: the one with a .scrawl/space.json is that space, one without is the personal space.

  --vault <folder>   A folder to serve; the same as giving it alone. May be repeated.
  --client <name>    What to write changes as, when the client does not say its name.
  --help, --version

Claude Code:    claude mcp add --scope user scrawl -- npx -y @scrawlnotes/mcp
Codex:          codex mcp add scrawl -- npx -y @scrawlnotes/mcp
Claude Desktop: install the scrawl.mcpb bundle.
`;

export interface Args {
  folders: string[];
  client?: string;
  help?: boolean;
  version?: boolean;
}

/** The command line read: folders alone or after --vault; --client; --help; --version. Empty arguments are nothing. */
export function parseArgs(argv: string[]): Args {
  const args: Args = { folders: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-v') args.version = true;
    else if (arg === '--vault' || arg === '--client') {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === '--vault') {
        if (value.trim()) args.folders.push(value.trim());
      } else args.client = value.trim() || undefined;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (arg.trim()) args.folders.push(arg.trim());
  }
  return args;
}

/** The tools over the vaults found, as the stdio server serves them. */
export function agentOf(found: FoundVault[], client?: string): Agent {
  const personal = found.find((vault) => vault.personal);
  return {
    spaces: async () => spacesOf(found),
    person: async () => (personal ? loadMe(new NodeFs(personal.folder)).catch(() => null) : null),
    ...(client && { client: { name: client } }),
  };
}

export async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    return 2;
  }
  if (args.help) {
    console.error(HELP);
    return 0;
  }
  if (args.version) {
    console.error(VERSION);
    return 0;
  }
  const host = { platform: process.platform, env: process.env, home: homedir() };
  let found: FoundVault[];
  if (args.folders.length > 0) {
    const vaults = await vaultsFromFolders(args.folders);
    for (const folder of vaults.missing) console.error(`No folder at ${folder}; left out.`);
    found = vaults.found;
  } else {
    const vaults = await vaultsFromSettings(host);
    if (vaults === null) {
      console.error(`The Scrawl desktop app has not been set up on this computer (no ${settingsFile(host)}). Give the folder of your notes: scrawl-mcp <folder>`);
      return 1;
    }
    found = vaults;
  }
  if (found.length === 0) {
    console.error('No space to serve: none of the folders is there.');
    return 1;
  }
  const agent = agentOf(found, args.client);
  serveStdio(() => buildServer(agent), { onerror: (error) => console.error(error.message) });
  console.error(`scrawl-mcp ${VERSION} (tools ${TOOLS_VERSION}) serving ${found.map((vault) => `${vault.name} (${vault.folder})`).join(', ')}`);
  return -1;
}

// Run as a command, not when imported by a test.
if (process.argv[1] && /scrawl-mcp(\.mjs)?$|[\\/]main\.(ts|mjs|js)$/.test(process.argv[1])) {
  const code = await main(process.argv.slice(2));
  if (code >= 0) process.exit(code);
}
