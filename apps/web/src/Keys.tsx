import {
  addGroup,
  addKey,
  cleanKey,
  groupText,
  isSecret,
  type KeyAt,
  type KeyEntry,
  type KeyGroup,
  keyCount,
  type KeysLook,
  parseKeys,
  removeGroup,
  removeKey,
  renameGroup,
  updateKey,
} from '@scrawlnotes/core';
import { createEnvEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { isPhone } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { Icon } from './Icon';
import { useNarrow } from './narrow';
import { PhoneKeysTable } from './PhoneKeys';
import { quote } from './text';

// A keys file, after the Keys views of design/mockups.html (direction A): its groups as a table,
// or its text as it is. Every change in the table is made to the lines of the text.

export interface KeysActions {
  /** The file's new text, after a change made in its table or its text. */
  change: (path: string, text: string) => void;
  /** On a phone an action sheet, with what it is about on top. */
  menu: (event: MouseEvent, items: MenuItem[], head?: MenuHead) => void;
  /** Asks before something is deleted. */
  ask: (title: string, message: string, run: () => void) => void;
  /** On a phone, says something for a moment at the foot: Copied. */
  notice?: (text: string) => void;
}

/** A group as the table points at it: its heading's line, checked by its name. */
type GroupRef = { line: number; name: string | null };

/** The one line of the table being typed in, if any. */
type Typing =
  /** Keys typed into a group; `after` is the key added last from the line, which stays right under it. */
  | { kind: 'add'; group: GroupRef; after: KeyAt | null }
  | { kind: 'edit'; at: KeyAt; focus: 'key' | 'value' }
  | { kind: 'rename'; group: GroupRef }
  | { kind: 'group' };

/** A secret value as it shows until asked for: always as long, so that its length is not told. */
const DOTS = '••••••••••';
/** How long "Copied" shows beside what was copied. */
const COPIED_MS = 1500;

/**
 * Puts text on the clipboard. Where the clipboard is not given to the page (some web views), the
 * text is copied the older way, from a field that is there only for that. Returns whether it went.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    const focused = document.activeElement as HTMLElement | null;
    document.body.append(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
      focused?.focus();
    }
  }
}

const refOf = (group: KeyGroup): GroupRef => ({ line: group.line, name: group.name });
const sameGroup = (ref: GroupRef, group: KeyGroup) => ref.line === group.line && ref.name === group.name;

/** The group a reference is to: the one at its line, else the first of its name, as lines may have moved. */
function groupAt(groups: KeyGroup[], ref: GroupRef): KeyGroup | undefined {
  return groups.find((g) => sameGroup(ref, g)) ?? groups.find((g) => g.name === ref.name);
}

/** The line a key, its value, or a group's name is typed in. Leaving an empty line to add closes it. */
function KeyLine({ start, focus = 'key', adding, onSubmit, onClose }: {
  start?: KeyEntry;
  focus?: 'key' | 'value';
  /** A line to add keys with: it empties after each and stays for the next. */
  adding: boolean;
  onSubmit: (key: string, value: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(start?.key ?? '');
  const [value, setValue] = useState(start?.value ?? '');
  const keyInput = useRef<HTMLInputElement>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const ready = cleanKey(key) !== '';
  const submit = () => {
    if (!ready) return keyInput.current?.focus();
    onSubmit(key, value);
    if (!adding) return;
    setKey('');
    setValue('');
    keyInput.current?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>, field: 'key' | 'value') => {
    if (event.key === 'Escape') onClose();
    // Adding, Enter after the name goes on to the value.
    else if (event.key === 'Enter' && field === 'key' && adding && ready && !value) valueInput.current?.focus();
    else if (event.key === 'Enter') submit();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (adding && !key.trim() && !value && !event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
  };
  // The buttons keep the focus in the line, so pressing them is not leaving it.
  const keepTyping = (event: MouseEvent) => event.preventDefault();
  const field = { spellCheck: false, autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off' } as const;
  return (
    <div className="kv-comp" onBlur={onBlur}>
      <input
        ref={keyInput}
        {...field}
        aria-label={t('keys.key')}
        placeholder={t('keys.key')}
        autoFocus={focus === 'key'}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => onKey(event, 'key')}
      />
      <input
        ref={valueInput}
        {...field}
        aria-label={t('keys.value')}
        placeholder={t('keys.value')}
        autoFocus={focus === 'value'}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => onKey(event, 'value')}
      />
      <span className="bt">
        <button type="button" className="primary" disabled={!ready} onMouseDown={keepTyping} onClick={submit}>
          {adding ? t('keys.add') : t('keys.save')}
        </button>
        <button type="button" onMouseDown={keepTyping} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
      </span>
    </div>
  );
}

/** A group's name typed in, in place of its header: for a new group, or to rename one. */
function NameLine({ start, adding, onSubmit, onClose }: {
  start?: string;
  adding: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(start ?? '');
  const ready = name.trim() !== '';
  const submit = () => ready && onSubmit(name);
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'Enter') submit();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (adding && !ready && !event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
  };
  const keepTyping = (event: MouseEvent) => event.preventDefault();
  return (
    <div className="kv-h kv-name" onBlur={onBlur}>
      <input
        aria-label={t('keys.groupName')}
        placeholder={t('keys.groupName')}
        autoFocus
        spellCheck={false}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKey}
      />
      <span className="bt">
        <button type="button" className="primary" disabled={!ready} onMouseDown={keepTyping} onClick={submit}>
          {adding ? t('keys.add') : t('keys.save')}
        </button>
        <button type="button" onMouseDown={keepTyping} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
      </span>
    </div>
  );
}

/** A key and its value. A click on either changes them; a secret value shows as dots until its eye is clicked. */
function KeyRow({ entry, secret, shown, copied, onReveal, onCopy, onEdit, onMenu }: {
  entry: KeyEntry;
  secret: boolean;
  shown: boolean;
  /** What the copy button says for a moment after it was pressed. */
  copied: string | null;
  onReveal: () => void;
  onCopy: () => void;
  onEdit: (focus: 'key' | 'value') => void;
  onMenu: (event: MouseEvent) => void;
}) {
  const hidden = secret && !shown;
  return (
    <div className="kv-row" onContextMenu={onMenu}>
      <button type="button" className="k" title={entry.key} onClick={() => onEdit('key')}>
        {entry.key}
      </button>
      <button type="button" className={hidden ? 'v hid' : 'v'} title={hidden ? undefined : entry.value} onClick={() => onEdit('value')}>
        {hidden ? DOTS : entry.value}
      </button>
      <span className="ib">
        {secret && (
          <button
            type="button"
            className={shown ? 'on' : undefined}
            title={shown ? t('keys.hide') : t('keys.show')}
            aria-label={shown ? t('keys.hide') : t('keys.show')}
            aria-pressed={shown}
            onClick={onReveal}
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} />
          </button>
        )}
        <button type="button" className={copied ? 'tipped' : undefined} title={t('keys.copyValue')} aria-label={t('keys.copyValue')} onClick={onCopy}>
          <Icon name="copy" />
          {copied && (
            <span className="tip" role="status">
              {copied}
            </span>
          )}
        </button>
        <button type="button" className="more" title={t('keys.keyMenu')} aria-label={t('keys.keyMenu')} onClick={onMenu}>
          ···
        </button>
      </span>
    </div>
  );
}

/** The file as text, with line numbers; what is typed goes to the file as it is. On a phone it opens to be read, without the keyboard. */
function KeysText({ text, onChange, onCursor, focus = true }: {
  text: string;
  onChange: (text: string) => void;
  onCursor: (at: { line: number; col: number }) => void;
  focus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof createEnvEditor> | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    const made = createEnvEditor({ parent: host.current!, doc: text, onChange: (doc) => changed.current(doc), onCursor });
    editor.current = made;
    if (focus) made.view.focus();
    return () => {
      made.destroy();
      editor.current = null;
    };
    // Made once; the text that changes later is put in by the effect below.
  }, []);
  // What came from elsewhere (sync, another program) is put in; what was typed here is already there.
  useEffect(() => editor.current?.setText(text), [text]);
  return <div className="kvtext" ref={host} />;
}

export function KeysView({ path, name, text, look, onLook, actions, onStatus, adding }: {
  path: string;
  name: string;
  text: string;
  look: KeysLook | undefined;
  onLook: (look: KeysLook) => void;
  actions: KeysActions;
  /** What the status bar says about the file: its counts, or where the cursor is in its text. Null once it is closed. */
  onStatus: (parts: string[] | null) => void;
  /** On a phone, counts the presses of +, each opening a new key's sheet. */
  adding?: number;
}) {
  const view = look?.view ?? 'table';
  const narrow = useNarrow();
  const groups = useMemo(() => parseKeys(text), [text]);
  // A change asked for later (after a confirmation) is made to the text as it is then.
  const latest = useRef(text);
  latest.current = text;
  const change = (next: string) => actions.change(path, next);
  const [typing, setTyping] = useState<Typing | null>(null);
  // Secret values asked for stay shown until the file is closed, by group and key name.
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    onStatus(
      view === 'table'
        ? [t('count.groups', { count: groups.length }), t('count.keys', { count: keyCount(groups) })]
        : [t('status.position', cursor), t('keys.format')],
    );
  }, [view, groups, cursor]);
  useEffect(() => () => onStatus(null), []);

  // On a phone: the name and Table or Text on top, then the groups as blocks, or the text.
  if (isPhone()) {
    return (
      <section className="bv keys-view mb-keys">
        <header className="mb-head split">
          <div>
            <h1>{name}</h1>
          </div>
          <div className="mb-seg" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => onLook({ view: 'table' })}>
              {t('keys.viewTable')}
            </button>
            <button type="button" role="tab" aria-selected={view === 'text'} onClick={() => onLook({ view: 'text' })}>
              {t('keys.viewText')}
            </button>
          </div>
        </header>
        {view === 'table' ? (
          <PhoneKeysTable text={text} latest={latest} change={change} actions={actions} adding={adding} />
        ) : (
          <KeysText text={text} onChange={change} onCursor={setCursor} focus={false} />
        )}
      </section>
    );
  }

  const copy = async (id: string, value: string) => setCopied({ id, ok: await writeClipboard(value) });
  const copiedText = (id: string) => (copied?.id === id ? (copied.ok ? t('keys.copied') : t('keys.notCopied')) : null);

  const startAdding = (group: GroupRef) => setTyping({ kind: 'add', group, after: null });
  // The first key goes first in the group, each next one after the one before, in the order typed.
  const addTo = (group: GroupRef, key: string, value: string) => {
    const after = typing?.kind === 'add' ? typing.after : null;
    const added = addKey(latest.current, group, key, value, after ?? 'first');
    if (!added.at) return;
    change(added.text);
    setTyping({ kind: 'add', group, after: added.at });
  };
  const makeGroup = (groupName: string) => {
    const next = addGroup(latest.current, groupName);
    const made = parseKeys(next).at(-1);
    change(next);
    // A new group is there to put keys in: its line to add them opens at once.
    if (made && made.name === groupName.trim()) startAdding(refOf(made));
    else setTyping(null);
  };

  const keyMenu = (event: MouseEvent, entry: KeyEntry) =>
    actions.menu(event, [
      { label: t('keys.edit'), run: () => setTyping({ kind: 'edit', at: entry, focus: 'value' }) },
      {
        label: t('menu.delete'),
        run: () => actions.ask(t('delete.key'), t('delete.keyText', { name: quote(entry.key) }), () => change(removeKey(latest.current, entry))),
      },
    ]);
  const groupMenu = (event: MouseEvent, group: KeyGroup) =>
    actions.menu(event, [
      { label: t('menu.rename'), run: () => setTyping({ kind: 'rename', group: refOf(group) }) },
      {
        label: t('menu.delete'),
        run: () => {
          const remove = () => change(removeGroup(latest.current, refOf(group)));
          // An empty group goes without asking, as an empty column does.
          if (group.keys.length === 0) return remove();
          const label = quote(group.name ?? t('keys.noGroup'));
          actions.ask(t('delete.group'), t('delete.groupWithKeys', { name: label, keys: t('count.keys', { count: group.keys.length }) }), remove);
        },
      },
    ]);

  // The group and key a line being typed in belongs to, found again after the text changed.
  const typingGroup = typing && (typing.kind === 'add' || typing.kind === 'rename') ? groupAt(groups, typing.group) : undefined;
  const editing = typing?.kind === 'edit' ? typing : null;
  const all = groups.flatMap((group) => group.keys);
  const edited = editing && (all.find((k) => k.line === editing.at.line && k.key === editing.at.key) ?? all.find((k) => k.key === editing.at.key));

  /**
   * A group's rows with the line keys are typed into, when it is open there: first in the group,
   * then right under the key added last from it.
   */
  const withLine = (group: KeyGroup, rows: ReactNode[]): ReactNode[] => {
    if (typing?.kind !== 'add' || typingGroup !== group) return rows;
    const { after } = typing;
    const last = after ? (group.keys.find((k) => k.line === after.line && k.key === after.key) ?? group.keys.find((k) => k.key === after.key)) : undefined;
    const at = last ? group.keys.indexOf(last) + 1 : 0;
    const line = <KeyLine key="adding" adding onSubmit={(key, value) => addTo(refOf(group), key, value)} onClose={() => setTyping(null)} />;
    return [...rows.slice(0, at), line, ...rows.slice(at)];
  };

  // Groups and keys are told apart by name and by how many of that name came before, which does not change as lines move.
  const seen = new Map<string, number>();
  const idOf = (prefix: string, label: string) => {
    const n = seen.get(`${prefix}${label}`) ?? 0;
    seen.set(`${prefix}${label}`, n + 1);
    return `${prefix}${label}#${n}`;
  };

  const table = (
    <div className="kv">
      {groups.map((group) => {
        const id = idOf('g:', group.name ?? '');
        const adding = typing?.kind === 'add' && typingGroup === group;
        const renaming = typing?.kind === 'rename' && typingGroup === group;
        return (
          <div key={id} className="kv-grp">
            {renaming ? (
              <NameLine
                start={group.name ?? ''}
                adding={false}
                onSubmit={(next) => {
                  change(renameGroup(latest.current, refOf(group), next));
                  setTyping(null);
                }}
                onClose={() => setTyping(null)}
              />
            ) : (
              <div className="kv-h" onContextMenu={(event) => groupMenu(event, group)}>
                <span className={group.name === null ? 'nm none' : 'nm'}>{group.name ?? t('keys.noGroup')}</span>
                <small>{group.keys.length}</small>
                <span className="acts">
                  {group.keys.length > 0 && (
                    <button type="button" className={copied?.id === id ? 'copied' : undefined} onClick={() => void copy(id, groupText(latest.current, refOf(group)))}>
                      {copiedText(id) ?? t('keys.copyGroup')}
                    </button>
                  )}
                  {/* While keys are typed into the group, its line's own buttons add them. */}
                  {!adding && (
                    <button type="button" onClick={() => startAdding(refOf(group))}>
                      {t('keys.addKeyRow')}
                    </button>
                  )}
                  <button type="button" className="more" title={t('keys.groupMenu')} aria-label={t('keys.groupMenu')} onClick={(event) => groupMenu(event, group)}>
                    ···
                  </button>
                </span>
              </div>
            )}
            {withLine(group, group.keys.map((entry) => {
              const keyId = idOf(`${id}/`, entry.key);
              if (entry === edited) {
                return (
                  <KeyLine
                    key={keyId}
                    start={entry}
                    focus={editing!.focus}
                    adding={false}
                    onSubmit={(key, value) => {
                      change(updateKey(latest.current, entry, key, value));
                      setTyping(null);
                    }}
                    onClose={() => setTyping(null)}
                  />
                );
              }
              const shownId = `${group.name ?? ''}\u0000${entry.key}`;
              return (
                <KeyRow
                  key={keyId}
                  entry={entry}
                  secret={isSecret(entry)}
                  shown={shown.has(shownId)}
                  copied={copiedText(keyId)}
                  onReveal={() =>
                    setShown((now) => {
                      const next = new Set(now);
                      if (!next.delete(shownId)) next.add(shownId);
                      return next;
                    })
                  }
                  onCopy={() => void copy(keyId, entry.value)}
                  onEdit={(focus) => setTyping({ kind: 'edit', at: entry, focus })}
                  onMenu={(event) => keyMenu(event, entry)}
                />
              );
            }))}
            {group.keys.length === 0 && !adding && <div className="kv-none">{t('keys.noKeys')}</div>}
          </div>
        );
      })}
      {typing?.kind === 'group' && (
        <div className="kv-grp">
          <NameLine adding onSubmit={makeGroup} onClose={() => setTyping(null)} />
        </div>
      )}
      {groups.length === 0 && typing?.kind !== 'group' && <p className="kv-empty">{t('keys.empty')}</p>}
      {/* On a phone the header has no room for it: a group is added at the end of the list. */}
      {narrow && typing?.kind !== 'group' && (
        <button type="button" className="kv-add" onClick={() => setTyping({ kind: 'group' })}>
          {t('keys.addGroupRow')}
        </button>
      )}
    </div>
  );

  return (
    <section className="bv keys-view">
      <header className="th">
        <b>{name}</b>
        <span className="vsw" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => onLook({ view: 'table' })}>
            {t('keys.viewTable')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'text'} onClick={() => onLook({ view: 'text' })}>
            {t('keys.viewText')}
          </button>
        </span>
        {view === 'table' && !narrow && (
          <button type="button" className="ghost" onClick={() => setTyping({ kind: 'group' })}>
            {t('keys.addGroup')}
          </button>
        )}
      </header>
      {view === 'table' ? table : <KeysText text={text} onChange={change} onCursor={setCursor} />}
    </section>
  );
}
