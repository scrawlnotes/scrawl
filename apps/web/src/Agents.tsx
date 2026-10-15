import { dayOf, RemoteSignedOut, type ServerAgent } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
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

// Settings › Agents, after the Agents part of design/mockups.html (design/agent.md, 8): an agent
// reaches the notes the way the person does. On this computer, the command the clients start and
// where to add it: Claude Desktop, Claude Code, Cursor. For each server this device is signed in
// to, the address, where to add it: Claude, ChatGPT, Claude Code; and the agents connected to the
// account, each to be disconnected. On a phone only the server part, since the phone's Claude
// reaches only a server.

export const MCP_PACKAGE = '@scrawlnotes/mcp';
export const MCP_COMMAND = `npx -y ${MCP_PACKAGE}`;
export const CLAUDE_CODE_LOCAL = `claude mcp add scrawl -- ${MCP_COMMAND}`;
/** The Claude Desktop bundle, on the latest release. */
export const MCPB_URL = 'https://github.com/scrawlnotes/scrawl/releases/latest/download/scrawl.mcpb';

/** Where a server's agents connect: `https://kaan.scrawlnotes.com/mcp`. */
export const mcpAddress = (url: string) => `${url.replace(/\/+$/, '')}/mcp`;
export const claudeCodeRemote = (url: string) => `claude mcp add --transport http scrawl ${mcpAddress(url)}`;
/** Cursor's install link: the server's config, base64, as docs.cursor.com/deeplinks has it. */
export const cursorLink = () => `cursor://anysphere.cursor-deeplink/mcp/install?name=scrawl&config=${btoa(JSON.stringify({ command: 'npx', args: ['-y', MCP_PACKAGE] }))}`;

const openLink = (href: string) => (isDesktop ? void openUrlOnDesktop(href).catch(() => undefined) : void window.open(href, '_blank', 'noopener'));

/** When an agent connected, as its row says it: `Oct 15`. */
const dayText = (at: number) => new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** When an agent was last here: today, yesterday, a day. */
const seenText = (seen: number) => dueLabel(dayOf(new Date(seen)), dayOf(new Date()));

const clientName = (agent: ServerAgent) => agent.client || t('agents.unnamedAgent');

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
  return { host, agents, error, disconnect };
}

/** Settings › Agents on a computer. */
export function Agents(values: Pick<SettingsValues, 'spaceName' | 'spaces' | 'folder' | 'onSection'>) {
  const servers = useKnownServers();
  const [copied, copy] = useCopy();
  const [adding, setAdding] = useState<{ to: AddTo; server: KnownServer } | null>(null);
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
            <button type="button" onClick={() => openLink(MCPB_URL)}>
              {t('agents.claudeDesktop')}
            </button>
            {button('code-local', CLAUDE_CODE_LOCAL, t('agents.claudeCode'))}
            <button type="button" onClick={() => openLink(cursorLink())}>
              {t('agents.cursor')}
            </button>
          </div>
          <p className="st-note">{copied === 'code-local' ? t('agents.codeCopied') : t('agents.thisComputerNote')}</p>
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
        servers.map((server) => <ServerBlock key={server.url} server={server} copied={copied} onCopy={copy} onAdd={(to) => setAdding({ to, server })} />)
      )}
      {adding && <AddToDialog to={adding.to} server={adding.server} onClose={() => setAdding(null)} />}
    </>
  );
}

type AddTo = 'claude' | 'chatgpt';

/** A server this device is signed in to: its address, where to add it, and the agents connected to the account. */
function ServerBlock({ server, copied, onCopy, onAdd }: { server: KnownServer; copied: string | null; onCopy: (key: string, text: string) => void; onAdd: (to: AddTo) => void }) {
  const a = useAgents(server.url);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; agent: ServerAgent } | null>(null);
  const address = mcpAddress(server.url);
  const code = claudeCodeRemote(server.url);
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
        <button type="button" onClick={() => onAdd('claude')}>
          {t('agents.claude')}
        </button>
        <button type="button" onClick={() => onAdd('chatgpt')}>
          {t('agents.chatgpt')}
        </button>
        <button type="button" onClick={() => onCopy(code, code)}>
          {copied === code ? t('agents.copied') : t('agents.claudeCode')}
        </button>
      </div>
      <p className="st-note">{copied === code ? t('agents.codeCopied') : t('agents.eachSignsIn')}</p>
      {a.error && (
        <p className="srv-err" role="alert">
          <Icon name="warn" />
          <span>{a.error}</span>
        </p>
      )}
      {a.agents && a.agents.length > 0 && (
        <div className="st-list">
          {a.agents.map((agent) => (
            <div key={agent.id} className={`st-li one${menu?.agent.id === agent.id ? ' menu-on' : ''}`} onContextMenu={(event) => open(event, agent)}>
              <span className="who bot" aria-hidden="true">
                {clientName(agent).slice(0, 1).toUpperCase()}
              </span>
              <span className="nm">
                <b>{clientName(agent)}</b>
                <small>{t('agents.connectedOn', { day: dayText(agent.connected) })}</small>
              </span>
              <span className="r">{seenText(agent.seen)}</span>
              <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, agent)}>
                ···
              </button>
            </div>
          ))}
        </div>
      )}
      {a.agents && <p className="st-note">{a.agents.length > 0 ? t('agents.connectedAbout') : t('agents.noneConnected')}</p>}
      {menu && <ContextMenu at={menu.at} items={[{ label: t('agents.disconnect'), danger: true, run: () => void a.disconnect(menu.agent.id) }]} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Add to Claude, or to ChatGPT: the steps, since each takes a connector from its own settings, and the address to paste. */
function AddToDialog({ to, server, onClose }: { to: AddTo; server: KnownServer; onClose: () => void }) {
  const [copied, copy] = useCopy();
  const address = mcpAddress(server.url);
  const host = hostOf(server.url);
  const title = t(to === 'claude' ? 'agents.addClaudeTitle' : 'agents.addChatgptTitle');
  return (
    <Dialog label={title} className="ag-add" onClose={onClose}>
      <h2>{title}</h2>
      <ol className="ag-steps">
        <li>{t(to === 'claude' ? 'agents.claudeStep1' : 'agents.chatgptStep1')}</li>
        <li>
          {t('agents.step2')}
          <div className="srv-copy">
            <input readOnly value={address} aria-label={t('agents.address')} onFocus={(event) => event.target.select()} />
            <button type="button" className="go" onClick={() => copy('address', address)}>
              {copied ? t('agents.copied') : t('agents.copy')}
            </button>
          </div>
        </li>
        <li>{t('agents.step3', { host })}</li>
      </ol>
      <p className="confirm">{t(to === 'claude' ? 'agents.claudeNote' : 'agents.chatgptNote')}</p>
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
                  {clientName(agent).slice(0, 1).toUpperCase()}
                </span>
                <span className="tx">
                  <b>{clientName(agent)}</b>
                  <small>{t('agents.connectedOn', { day: dayText(agent.connected) })}</small>
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
          head={{ icon: 'agent', title: clientName(held), sub: `${a.host} · ${t('agents.connectedOn', { day: dayText(held.connected) })}` }}
          items={[{ label: t('agents.disconnect'), danger: true, run: () => void a.disconnect(held.id) }]}
          onClose={() => setHeld(null)}
        />
      )}
      {adding && <AddToDialog to={adding} server={server} onClose={() => setAdding(null)} />}
    </>
  );
}
