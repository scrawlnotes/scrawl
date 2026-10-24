import { type ComputerAgent, dayOf, RemoteSignedOut, type ServerAgent } from '@scrawlnotes/core';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { version as mcpVersion } from '../../mcp/package.json';
import { type MouseEvent, useCallback, useEffect, useState } from 'react';
import { ContextMenu, Dialog } from './dialogs';
import { Icon } from './Icon';
import { writeClipboard } from './Keys';
import { serverFailure } from './ServerConnect';
import { hostOf, type KnownServer, serverAccount, useKnownServers } from './servers';
import type { SettingsValues } from './Settings';
import { ActionSheet } from './sheets';
import { isDesktop, openUrlOnDesktop } from './storage';
import { ServerIcon } from './SyncViews';
import { dueLabel } from './Tasks';
import { setBackground, useBackground } from './tray';

// Settings › Agents, after the Agents part of design/mockups.html (design/agent.md, 8): an agent
// reaches the notes the way the person does. On this computer, the command the clients start and
// where to add it: Claude Desktop, Claude Code, Codex, Cursor, Antigravity. For each server this
// device is signed in to, the address, where to add it: Claude, ChatGPT, Gemini, Claude Code, Codex,
// Cursor, Antigravity; and the agents connected to the account, each to be disconnected. On a phone
// only the server part, since the phone's Claude reaches only a server.

export const MCP_PACKAGE = '@scrawlnotes/mcp';
export const MCP_COMMAND = `npx -y ${MCP_PACKAGE}`;
/** For every folder: without --scope user, Claude Code adds a server only for the folder it is run in. */
export const CLAUDE_CODE_LOCAL = `claude mcp add --scope user scrawl -- ${MCP_COMMAND}`;
/** Codex keeps its servers in ~/.codex/config.toml, for every folder. */
export const CODEX_LOCAL = `codex mcp add scrawl -- ${MCP_COMMAND}`;
/** The Claude Desktop bundle, on the release of the command's version: the latest release is the desktop app's. */
export const MCPB_URL = `https://github.com/scrawlnotes/scrawl/releases/download/mcp-v${mcpVersion}/scrawl.mcpb`;

/** Where a server's agents connect: `https://kaan.scrawlnotes.com/mcp`. */
export const mcpAddress = (url: string) => `${url.replace(/\/+$/, '')}/mcp`;
export const claudeCodeRemote = (url: string) => `claude mcp add --transport http --scope user scrawl ${mcpAddress(url)}`;
export const codexRemote = (url: string) => `codex mcp add scrawl --url ${mcpAddress(url)}`;
/** Cursor's install link: the server's config, base64, as docs.cursor.com/deeplinks has it; the command here, or a server's address. */
export const cursorLink = (url?: string) =>
  `cursor://anysphere.cursor-deeplink/mcp/install?name=scrawl&config=${encodeURIComponent(btoa(JSON.stringify(url ? { url: mcpAddress(url) } : { command: 'npx', args: ['-y', MCP_PACKAGE] })))}`;
/** Antigravity keeps its servers in one file, which its app, its editor and its command line read. */
export const ANTIGRAVITY_FILE = /Windows/.test(navigator.userAgent) ? '%USERPROFILE%\\.gemini\\config\\mcp_config.json' : '~/.gemini/config/mcp_config.json';
/** What goes in that file: the command here, or a server's address (`serverUrl`, which every Antigravity takes). */
export const antigravityConfig = (url?: string) => JSON.stringify({ mcpServers: { scrawl: url ? { serverUrl: mcpAddress(url) } : { command: 'npx', args: ['-y', MCP_PACKAGE] } } }, null, 2);

const openLink = (href: string) => (isDesktop ? void openUrlOnDesktop(href).catch(() => undefined) : void window.open(href, '_blank', 'noopener'));

/** When an agent connected, as its row says it: `Oct 15`. */
const dayText = (at: number) => new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** When an agent was last here: today, yesterday, a day. */
const seenText = (seen: number) => dueLabel(dayOf(new Date(seen)), dayOf(new Date()));

const clientName = (agent: ServerAgent) => agent.client || t('agents.unnamedAgent');

/** What an agent is called: its own name once it has one, else its client's. */
const agentName = (agent: ServerAgent) => agent.name || clientName(agent);

/** An agent's square: its client's first letter. */
const initialOf = (client: string) => (client.trim() || '?').slice(0, 1).toUpperCase();

/** Copies on click, and says Copied for a moment where it was clicked. */
function useCopy(): [copied: string | null, copy: (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (key: string, text: string) => void writeClipboard(text).then((went) => went && setCopied(key));
  return [copied, copy];
}

/** The agents connected to the account on a server, and ending one. */
export function useAgents(url: string) {
  const host = hostOf(url);
  const [agents, setAgents] = useState<ServerAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setAgents(await serverAccount(url).agents());
      setError(null);
    } catch (failure) {
      setAgents((now) => now ?? []);
      setError(failure instanceof RemoteSignedOut ? t('server.signInAgain', { host }) : serverFailure(failure, host));
    }
  }, [url, host]);
  useEffect(() => {
    void load();
  }, [load]);
  const disconnect = async (id: string) => {
    try {
      await serverAccount(url).disconnectAgent(id);
      await load();
    } catch (failure) {
      setError(serverFailure(failure, host));
    }
  };
  const rename = async (id: string, name: string) => {
    try {
      await serverAccount(url).renameAgent(id, name);
      await load();
    } catch (failure) {
      setError(serverFailure(failure, host));
    }
  };
  return { host, agents, error, disconnect, rename };
}

/** Settings › Agents on a computer. */
export function Agents(values: Pick<SettingsValues, 'spaceName' | 'spaces' | 'folder' | 'onSection' | 'computerAgents' | 'onRenameComputerAgent'>) {
  const servers = useKnownServers();
  const background = useBackground();
  const [copied, copy] = useCopy();
  const [adding, setAdding] = useState<{ to: AddTo; server: KnownServer } | null>(null);
  const [running, setRunning] = useState<{ to: Terminal; server?: KnownServer } | null>(null);
  const [antigravity, setAntigravity] = useState<{ server?: KnownServer } | null>(null);
  const names = [values.spaceName ?? t('settings.personal'), ...values.spaces.map((space) => space.name)].join(' · ');
  const button = (key: string, text: string, label: string) => (
    <button type="button" onClick={() => copy(key, text)}>
      {copied === key ? t('agents.copied') : label}
    </button>
  );
  return (
    <>
      <p className="st-note">{t('agents.about')}</p>
      {values.folder ? (
        <div className="st-space ag">
          <div className="top">
            <Icon name="laptop" />
            <b>{t('agents.thisComputer')}</b>
            <small title={names}>{names}</small>
          </div>
          <div className="st-row">
            <span className="fl">{t('agents.command')}</span>
            <span className="path" title={MCP_COMMAND}>
              {MCP_COMMAND}
            </span>
            {button('command', MCP_COMMAND, t('agents.copy'))}
          </div>
          <div className="st-acts">
            <small className="lab">{t('agents.addTo')}</small>
            <span className="ag-to">
              <button type="button" onClick={() => openLink(MCPB_URL)}>
                {t('agents.claudeDesktop')}
              </button>
              <button type="button" onClick={() => setRunning({ to: 'claude-code' })}>
                {t('agents.claudeCode')}
              </button>
              <button type="button" onClick={() => setRunning({ to: 'codex' })}>
                {t('agents.codex')}
              </button>
              <button type="button" onClick={() => openLink(cursorLink())}>
                {t('agents.cursor')}
              </button>
              <button type="button" onClick={() => setAntigravity({})}>
                {t('agents.antigravity')}
              </button>
            </span>
          </div>
          {values.computerAgents && values.onRenameComputerAgent && <ComputerAgents load={values.computerAgents} onRename={values.onRenameComputerAgent} />}
          <p className="st-note">{t('agents.thisComputerNote')}</p>
          {!background && (
            <div className="ag-closed">
              <span>{t('agents.closedWaits')}</span>
              <button type="button" onClick={() => setBackground(true)}>
                {t('agents.keepRunning')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="ag-none">
          <Icon name="laptop" />
          <span>{t('agents.inBrowser')}</span>
        </div>
      )}
      {servers.length === 0 ? (
        <div className="ag-none">
          <ServerIcon />
          <span>{t('agents.noServer')}</span>
          {values.onSection && (
            <button type="button" className="primary" onClick={() => values.onSection!('spaces', { adding: true })}>
              {t('server.connect')}
            </button>
          )}
        </div>
      ) : (
        servers.map((server) => (
          <ServerBlock
            key={server.url}
            server={server}
            copied={copied}
            onCopy={copy}
            onAdd={(to) => {
              if (to === 'cursor') openLink(cursorLink(server.url));
              else if (to === 'antigravity') setAntigravity({ server });
              else if (to === 'claude-code' || to === 'codex') setRunning({ to, server });
              else setAdding({ to, server });
            }}
          />
        ))
      )}
      {adding && <AddToDialog to={adding.to} server={adding.server} onClose={() => setAdding(null)} />}
      {running && <TerminalDialog to={running.to} server={running.server} onClose={() => setRunning(null)} />}
      {antigravity && <AntigravityDialog server={antigravity.server} onClose={() => setAntigravity(null)} />}
    </>
  );
}

type AddTo = 'claude' | 'chatgpt' | 'gemini';
/** The agents that take a server from a command typed in a terminal. */
type Terminal = 'claude-code' | 'codex';
/** Where a server is added from its block: Cursor by its install link, Antigravity by its file. */
type ServerAddTo = AddTo | Terminal | 'cursor' | 'antigravity';

/** A server this device is signed in to: its address, where to add it, and the agents connected to the account. */
function ServerBlock({ server, copied, onCopy, onAdd }: { server: KnownServer; copied: string | null; onCopy: (key: string, text: string) => void; onAdd: (to: ServerAddTo) => void }) {
  const a = useAgents(server.url);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; agent: ServerAgent } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const address = mcpAddress(server.url);
  const open = (event: MouseEvent, agent: ServerAgent) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, agent });
  };
  return (
    <div className="st-space ag srv">
      <div className="top">
        <ServerIcon />
        <b>{a.host}</b>
        <small>{server.email}</small>
      </div>
      <div className="st-row">
        <span className="fl">{t('agents.address')}</span>
        <span className="path" title={address}>
          {address}
        </span>
        <button type="button" onClick={() => onCopy(address, address)}>
          {copied === address ? t('agents.copied') : t('agents.copy')}
        </button>
      </div>
      <div className="st-acts">
        <small className="lab">{t('agents.addTo')}</small>
        <span className="ag-to">
          <button type="button" onClick={() => onAdd('claude')}>
            {t('agents.claude')}
          </button>
          <button type="button" onClick={() => onAdd('chatgpt')}>
            {t('agents.chatgpt')}
          </button>
          <button type="button" onClick={() => onAdd('gemini')}>
            {t('agents.gemini')}
          </button>
          <button type="button" onClick={() => onAdd('claude-code')}>
            {t('agents.claudeCode')}
          </button>
          <button type="button" onClick={() => onAdd('codex')}>
            {t('agents.codex')}
          </button>
          <button type="button" onClick={() => onAdd('cursor')}>
            {t('agents.cursor')}
          </button>
          <button type="button" onClick={() => onAdd('antigravity')}>
            {t('agents.antigravity')}
          </button>
        </span>
      </div>
      <p className="st-note">{t('agents.eachSignsIn')}</p>
      {a.error && (
        <p className="srv-err" role="alert">
          <Icon name="warn" />
          <span>{a.error}</span>
        </p>
      )}
      {a.agents && a.agents.length > 0 && (
        <div className="st-list">
          {a.agents.map((agent) =>
            renaming === agent.id ? (
              <AgentRename key={agent.id} initial={initialOf(clientName(agent))} name={agentName(agent)} onCancel={() => setRenaming(null)} onSave={(name) => void a.rename(agent.id, name).then(() => setRenaming(null))} />
            ) : (
              <div key={agent.id} className={`st-li one ag-li${menu?.agent.id === agent.id ? ' menu-on' : ''}`} onContextMenu={(event) => open(event, agent)}>
                <span className="who bot" aria-hidden="true">
                  {initialOf(clientName(agent))}
                </span>
                <span className="nm">
                  <b>{agentName(agent)}</b>
                  <small>{t('agents.clientOn', { client: clientName(agent), day: dayText(agent.connected) })}</small>
                </span>
                <span className="r">{seenText(agent.seen)}</span>
                <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, agent)}>
                  ···
                </button>
              </div>
            ),
          )}
        </div>
      )}
      {a.agents && <p className="st-note">{a.agents.length > 0 ? t('agents.connectedAbout') : t('agents.noneConnected')}</p>}
      {menu && (
        <ContextMenu
          at={menu.at}
          items={[
            { label: t('agents.rename'), run: () => setRenaming(menu.agent.id) },
            { label: t('agents.disconnect'), danger: true, run: () => void a.disconnect(menu.agent.id) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** This computer's name as the desktop app has it, which the command an agent runs here takes too; null where it is not known. */
async function thisComputer(): Promise<string | null> {
  if (!isDesktop) return null;
  return (await import('@tauri-apps/api/core')).invoke<string | null>('device_name').catch(() => null);
}

/** Whether two names are one computer: in any case, without a domain. */
const sameComputer = (a: string, b: string) => a.split('.')[0]!.toLowerCase() === b.split('.')[0]!.toLowerCase();

/**
 * The person's agents on this computer, in its block (design/activity.md 2.1): each with its
 * name, its client and since when, and when it last changed something; Rename in its menu. They
 * are kept in the person's own space, which syncs: another computer's are not shown here.
 */
function ComputerAgents({ load, onRename }: { load: () => Promise<ComputerAgent[]>; onRename: (id: string, name: string) => Promise<void> }) {
  const [agents, setAgents] = useState<ComputerAgent[]>([]);
  const [computer, setComputer] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const reload = useCallback(() => void load().then(setAgents, () => setAgents([])), [load]);
  useEffect(() => {
    reload();
    void thisComputer().then(setComputer);
  }, [reload]);
  const here = agents.filter((agent) => !computer || sameComputer(agent.machine, computer));
  if (here.length === 0) return null;
  const open = (event: MouseEvent, id: string) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, id });
  };
  const rename = (id: string, name: string) =>
    void onRename(id, name).then(() => {
      setRenaming(null);
      reload();
    });
  return (
    <div className="st-list">
      {here.map((agent) =>
        renaming === agent.id ? (
          <AgentRename key={agent.id} initial={initialOf(agent.client)} name={agent.name} onCancel={() => setRenaming(null)} onSave={(name) => rename(agent.id, name)} />
        ) : (
          <div key={agent.id} className={`st-li one ag-li${menu?.id === agent.id ? ' menu-on' : ''}`} onContextMenu={(event) => open(event, agent.id)}>
            <span className="who bot" aria-hidden="true">
              {initialOf(agent.client)}
            </span>
            <span className="nm">
              <b>{agent.name}</b>
              <small>{t('agents.clientOn', { client: agent.client, day: dayText(Date.parse(agent.created)) })}</small>
            </span>
            <span className="r">{agent.seen ? seenText(Date.parse(agent.seen)) : ''}</span>
            <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, agent.id)}>
              ···
            </button>
          </div>
        ),
      )}
      {menu && <ContextMenu at={menu.at} items={[{ label: t('agents.rename'), run: () => setRenaming(menu.id) }]} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** An agent's row while it is renamed: its name in a box, Cancel and Save; Enter saves, Esc goes back. */
function AgentRename({ initial, name, onSave, onCancel }: { initial: string; name: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [typed, setTyped] = useState(name);
  const save = () => {
    const clean = typed.trim();
    if (!clean) return;
    if (clean === name) onCancel();
    else onSave(clean);
  };
  return (
    <div className="st-li one ag-ren">
      <span className="who bot" aria-hidden="true">
        {initial}
      </span>
      <input
        className="in"
        autoFocus
        aria-label={t('agents.name')}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
          if (event.key === 'Escape') onCancel();
        }}
      />
      <button type="button" onClick={onCancel}>
        {t('dialog.cancel')}
      </button>
      <button type="button" className="primary" disabled={!typed.trim()} onClick={save}>
        {t('settings.save')}
      </button>
    </div>
  );
}

/**
 * How each takes a server, in the words of its own window: where to open it, its fields with what
 * goes in each, what to choose after them, and what to know.
 */
const ADD_TO: Record<AddTo, { title: MessageKey; open: MessageKey; fields: [label: MessageKey, value: 'name' | 'description' | 'address'][]; then: MessageKey; note: MessageKey }> = {
  claude: {
    title: 'agents.addClaudeTitle',
    open: 'agents.claudeStep1',
    fields: [
      ['agents.fieldName', 'name'],
      ['agents.fieldClaudeUrl', 'address'],
    ],
    then: 'agents.claudeStep3',
    note: 'agents.claudeNote',
  },
  chatgpt: {
    title: 'agents.addChatgptTitle',
    open: 'agents.chatgptStep1',
    fields: [
      ['agents.fieldName', 'name'],
      ['agents.fieldDescription', 'description'],
      ['agents.fieldConnection', 'address'],
    ],
    then: 'agents.chatgptStep3',
    note: 'agents.chatgptNote',
  },
  gemini: {
    title: 'agents.addGeminiTitle',
    open: 'agents.geminiStep1',
    fields: [['agents.fieldGeminiUrl', 'address']],
    then: 'agents.geminiStep3',
    note: 'agents.geminiNote',
  },
};

/** Add to Claude, ChatGPT or Gemini: the steps, since each takes a server in its own settings, and what to write in each field, to copy. */
function AddToDialog({ to, server, onClose }: { to: AddTo; server: KnownServer; onClose: () => void }) {
  const [copied, copy] = useCopy();
  const how = ADD_TO[to];
  const values = { name: 'Scrawl', description: t('agents.description'), address: mcpAddress(server.url) };
  const title = t(how.title);
  return (
    <Dialog label={title} className="ag-add" onClose={onClose}>
      <h2>{title}</h2>
      <ol className="ag-steps">
        <li>{t(how.open)}</li>
        <li>
          {t('agents.fillIn', { count: how.fields.length })}
          <div className="ag-fields">
            {how.fields.map(([label, value]) => (
              <div key={value} className="srv-copy">
                <span className="fl">{t(label)}</span>
                <input readOnly value={values[value]} aria-label={t(label)} onFocus={(event) => event.target.select()} />
                <button type="button" className={`go${copied === value ? ' on' : ''}`} onClick={() => copy(value, values[value])}>
                  {copied === value ? t('agents.copied') : t('agents.copy')}
                </button>
              </div>
            ))}
          </div>
        </li>
        <li>{t(how.then)}</li>
        <li>{t('agents.signIn', { host: hostOf(server.url) })}</li>
      </ol>
      <p className="confirm">{t(how.note)}</p>
      <div className="dialog-actions">
        <button type="button" className="done" onClick={onClose}>
          {t('agents.done')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * What each runs in a terminal: to add Scrawl on this computer or from a server, to sign in to the
 * server, and to remove it; and what to know.
 */
const TERMINAL: Record<Terminal, { title: MessageKey; local: string; remote: (url: string) => string; login: string; remove: string; session: MessageKey; note: MessageKey }> = {
  'claude-code': {
    title: 'agents.addClaudeCodeTitle',
    local: CLAUDE_CODE_LOCAL,
    remote: claudeCodeRemote,
    login: 'claude mcp login scrawl',
    remove: 'claude mcp remove scrawl',
    session: 'agents.claudeCodeSession',
    note: 'agents.claudeCodeNote',
  },
  codex: {
    title: 'agents.addCodexTitle',
    local: CODEX_LOCAL,
    remote: codexRemote,
    login: 'codex mcp login scrawl',
    remove: 'codex mcp remove scrawl',
    session: 'agents.codexSession',
    note: 'agents.codexNote',
  },
};

/** A command or a file's text, whole, with Copy beside it; `lines` keeps its lines as written. */
function CopyCode({ text, copied, onCopy, lines }: { text: string; copied: boolean; onCopy: () => void; lines?: boolean }) {
  return (
    <div className={`ag-code${lines ? ' lines' : ''}`}>
      <code>{text}</code>
      <button type="button" className={`go${copied ? ' on' : ''}`} onClick={onCopy}>
        {copied ? t('agents.copied') : t('agents.copy')}
      </button>
    </div>
  );
}

/** Add to Claude Code or Codex: the commands to run, each whole with Copy beside it; from a server, signing in too; and removing it. */
function TerminalDialog({ to, server, onClose }: { to: Terminal; server?: KnownServer; onClose: () => void }) {
  const [copied, copy] = useCopy();
  const how = TERMINAL[to];
  const title = t(how.title);
  const command = (key: string, text: string) => <CopyCode text={text} copied={copied === key} onCopy={() => copy(key, text)} />;
  return (
    <Dialog label={title} className="ag-add" onClose={onClose}>
      <h2>{title}</h2>
      <ol className="ag-steps">
        <li>
          {t('agents.runInTerminal')}
          {command('add', server ? how.remote(server.url) : how.local)}
        </li>
        {server && (
          <li>
            {t('agents.runSignIn', { host: hostOf(server.url) })}
            {command('login', how.login)}
          </li>
        )}
        <li>{t(how.session)}</li>
      </ol>
      {!server && <p className="confirm">{t('agents.localNote')}</p>}
      <p className="confirm">{t(how.note)}</p>
      <div className="ag-remove">
        {t('agents.toRemove')}
        {command('remove', how.remove)}
      </div>
      <div className="dialog-actions">
        <button type="button" className="done" onClick={onClose}>
          {t('agents.done')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Add to Antigravity, which has no command and no link for it: the file to open, what to put in
 * it, each with Copy; from a server, signing in with the code Antigravity asks for; and removing it.
 */
function AntigravityDialog({ server, onClose }: { server?: KnownServer; onClose: () => void }) {
  const [copied, copy] = useCopy();
  const title = t('agents.addAntigravityTitle');
  const config = antigravityConfig(server?.url);
  return (
    <Dialog label={title} className="ag-add" onClose={onClose}>
      <h2>{title}</h2>
      <ol className="ag-steps">
        <li>
          {t('agents.antigravityOpen')}
          <CopyCode text={ANTIGRAVITY_FILE} copied={copied === 'file'} onCopy={() => copy('file', ANTIGRAVITY_FILE)} />
        </li>
        <li>
          {t('agents.antigravityPut')}
          <CopyCode text={config} copied={copied === 'config'} onCopy={() => copy('config', config)} lines />
        </li>
        {server ? (
          <>
            <li>{t('agents.antigravityAuthenticate')}</li>
            <li>{t('agents.antigravityCode', { host: hostOf(server.url) })}</li>
          </>
        ) : (
          <li>{t('agents.antigravityRestart')}</li>
        )}
      </ol>
      {!server && <p className="confirm">{t('agents.localNote')}</p>}
      <p className="confirm">{t('agents.antigravityNote')}</p>
      <div className="ag-remove">{t('agents.antigravityRemove')}</div>
      <div className="dialog-actions">
        <button type="button" className="done" onClick={onClose}>
          {t('agents.done')}
        </button>
      </div>
    </Dialog>
  );
}

/** Settings › Agents on a phone: only the server part; without a server, where to get one. */
export function PhoneAgents({ onConnect }: { onConnect: () => void }) {
  const servers = useKnownServers();
  if (servers.length === 0) {
    return (
      <>
        <p className="mb-p">{t('agents.phoneNoServer')}</p>
        <div className="mb-list apart">
          <button type="button" className="mb-row add" onClick={onConnect}>
            <Icon name="plus" />
            <span className="tx">
              <b>{t('server.connect')}</b>
            </span>
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      {servers.map((server) => (
        <PhoneServerAgents key={server.url} server={server} />
      ))}
    </>
  );
}

function PhoneServerAgents({ server }: { server: KnownServer }) {
  const a = useAgents(server.url);
  const [held, setHeld] = useState<ServerAgent | null>(null);
  const [adding, setAdding] = useState<AddTo | null>(null);
  const [copied, copy] = useCopy();
  const address = mcpAddress(server.url);
  return (
    <>
      <div className="mb-sec">
        <span>{a.host}</span>
      </div>
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr" onClick={() => copy('address', address)}>
            <span className="fl">{t('agents.address')}</span>
            <span className="in mono">{address}</span>
            <span className="val">{copied ? t('agents.copied') : <Icon name="copy" />}</span>
          </button>
        </div>
      </div>
      <div className="mb-list">
        <button type="button" className="mb-row" onClick={() => setAdding('claude')}>
          <Icon name="plus" />
          <span className="tx">
            <b>{t('agents.addClaudeTitle')}</b>
            <small>{t('agents.claudeSub')}</small>
          </span>
          <Icon name="chevron" />
        </button>
        <button type="button" className="mb-row" onClick={() => setAdding('chatgpt')}>
          <Icon name="plus" />
          <span className="tx">
            <b>{t('agents.addChatgptTitle')}</b>
            <small>{t('agents.chatgptSub')}</small>
          </span>
          <Icon name="chevron" />
        </button>
        <button type="button" className="mb-row" onClick={() => setAdding('gemini')}>
          <Icon name="plus" />
          <span className="tx">
            <b>{t('agents.addGeminiTitle')}</b>
            <small>{t('agents.geminiSub')}</small>
          </span>
          <Icon name="chevron" />
        </button>
      </div>
      <p className="mb-p">{t('agents.phoneAddedNote')}</p>
      {a.error && <p className="mb-p err">{a.error}</p>}
      <div className="mb-sec">
        <span>{t('agents.connectedTo')}</span>
      </div>
      {a.agents && a.agents.length > 0 ? (
        <>
          <div className="mb-list">
            {a.agents.map((agent) => (
              <button key={agent.id} type="button" className="mb-row person" onClick={() => setHeld(agent)}>
                <span className="who bot" aria-hidden="true">
                  {initialOf(clientName(agent))}
                </span>
                <span className="tx">
                  <b>{agentName(agent)}</b>
                  <small>{t('agents.clientOn', { client: clientName(agent), day: dayText(agent.connected) })}</small>
                </span>
                <span className="ct">{seenText(agent.seen)}</span>
              </button>
            ))}
          </div>
          <p className="mb-p">{t('agents.phoneTapNote')}</p>
        </>
      ) : (
        a.agents && <p className="mb-p">{t('agents.noneConnected')}</p>
      )}
      {held && (
        <ActionSheet
          head={{ icon: 'agent', title: agentName(held), sub: `${a.host} · ${t('agents.connectedOn', { day: dayText(held.connected) })}` }}
          items={[{ label: t('agents.disconnect'), danger: true, run: () => void a.disconnect(held.id) }]}
          onClose={() => setHeld(null)}
        />
      )}
      {adding && <AddToDialog to={adding} server={server} onClose={() => setAdding(null)} />}
    </>
  );
}
