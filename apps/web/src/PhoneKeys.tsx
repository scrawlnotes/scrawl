import {
  addGroup,
  addKey,
  cleanKey,
  groupText,
  isSecret,
  type KeyEntry,
  type KeyGroup,
  parseKeys,
  removeGroup,
  removeKey,
  renameGroup,
  updateKey,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { type KeysActions, writeClipboard } from './Keys';
import { Empty, liftUntilTouch, Sheet } from './sheets';
import { quote } from './text';

// Keys on a phone, after the Phone keys view of design/mockups.html. A group is a rounded block
// of keys, each name over its value; a secret shows dots until its eye is tapped; every value has
// its copy button, and Copied shows at the foot for a moment. A tap opens the key in a sheet: its
// name, value and group, Delete key under them; + opens the same sheet for a new key. The group's
// ··· has Add key, Copy as .env, Rename and Delete; Add group ends the list.

/** A group as the list points at it: its heading's line, checked by its name. */
type GroupRef = { line: number; name: string | null };

const refOf = (group: KeyGroup): GroupRef => ({ line: group.line, name: group.name });
const sameRef = (a: GroupRef, b: GroupRef) => a.line === b.line && a.name === b.name;
/** The keys before any heading, the only place for a key in a file with no group yet. */
const NO_GROUP: GroupRef = { line: -1, name: null };

/** A secret value as it shows until asked for: always as long, so that its length is not told. */
const DOTS = '••••••••••';
/** How long the copy button shows its tick. */
const COPIED_MS = 1500;
/** How long a finger rests on a key before its menu opens. */
const HOLD_MS = 450;

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** What a key's name and value are typed with: no spelling, no corrections. */
const FIELD = { spellCheck: false, autoComplete: 'off', autoCorrect: 'off' } as const;

const groupLabel = (name: string | null) => name ?? t('keys.noGroup');

/** A finger resting on a key: after a moment its menu opens, and the tap that ends it does nothing else. A right click opens it too. */
function useHold() {
  const pressed = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);
  const letGo = () => {
    const at = pressed.current;
    if (at && !at.fired) {
      window.clearTimeout(at.timer);
      pressed.current = null;
    }
  };
  return (onHold: (element: HTMLElement) => void) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      const element = event.currentTarget;
      const at = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
      at.timer = window.setTimeout(() => {
        at.fired = true;
        onHold(element);
      }, HOLD_MS);
      pressed.current = at;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const at = pressed.current;
      if (at && !at.fired && Math.hypot(event.clientX - at.x, event.clientY - at.y) > 8) letGo();
    },
    onPointerUp: letGo,
    onPointerCancel: letGo,
    onClickCapture: (event: MouseEvent) => {
      if (pressed.current?.fired) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressed.current = null;
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (!pressed.current?.fired) onHold(event.currentTarget);
    },
  });
}

/**
 * A key in a sheet, after the Phone keys view: its name and value typed in place, the value as
 * dots behind its eye when it is a secret, and its group picked in a list of its own. Save, or Add
 * for a new one, at the top; Delete key under a key that is there.
 */
function KeySheet({ groups, group, entry, revealed, onSave, onDelete, onClose }: {
  groups: GroupRef[];
  group: GroupRef;
  /** Null for a new key. */
  entry: KeyEntry | null;
  /** A secret whose value the list shows: it shows here too. */
  revealed: boolean;
  onSave: (into: GroupRef, name: string, value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(entry?.key ?? '');
  const [value, setValue] = useState(entry?.value ?? '');
  const [into, setInto] = useState<GroupRef>(group);
  const [hidden, setHidden] = useState(entry ? isSecret(entry) && !revealed : false);
  const [picking, setPicking] = useState(false);
  const valueBox = useRef<HTMLInputElement>(null);
  const ready = cleanKey(name) !== '';
  const secret = isSecret({ key: name, value });
  const title = entry ? t('keys.key') : t('phone.newKey');
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    onSave(into, name, value);
    onClose();
  };
  if (picking) {
    return (
      <Sheet label={t('phone.group')} className="mb-create" onClose={onClose}>
        <div className="mb-sh three">
          <button type="button" className="cancel back" onClick={() => setPicking(false)}>
            <Icon name="back" />
            <span>{title}</span>
          </button>
          <b>{t('phone.group')}</b>
          <span />
        </div>
        <div className="mb-form">
          <div className="mb-group">
            {groups.map((each) => (
              <button
                key={`${each.line}\u0000${each.name ?? ''}`}
                type="button"
                className="mb-fr pick"
                onClick={() => {
                  setInto(each);
                  setPicking(false);
                }}
              >
                <span className="in">{groupLabel(each.name)}</span>
                <Tick on={sameRef(each, into)} />
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet label={title} className="mb-create mb-keysheet" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{title}</b>
        <button type="button" className="ok" disabled={!ready} onMouseDown={(event) => event.preventDefault()} onClick={() => save()}>
          {entry ? t('keys.save') : t('keys.add')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <span className="fl">{t('phone.keyName')}</span>
            <input
              {...FIELD}
              className="in r mono"
              autoCapitalize="characters"
              enterKeyHint="next"
              autoFocus={!entry}
              aria-label={t('phone.keyName')}
              placeholder="API_KEY"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                valueBox.current?.focus();
              }}
            />
          </label>
          <label className="mb-fr">
            <span className="fl">{t('keys.value')}</span>
            <input
              {...FIELD}
              ref={valueBox}
              className={secret && hidden ? 'in r mono hid' : 'in r mono'}
              autoCapitalize="none"
              enterKeyHint="done"
              aria-label={t('keys.value')}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                save();
              }}
            />
            {secret && (
              <button type="button" className="go2" aria-label={hidden ? t('keys.show') : t('keys.hide')} title={hidden ? t('keys.show') : t('keys.hide')} onClick={() => setHidden(!hidden)}>
                <Icon name={hidden ? 'eye' : 'eyeOff'} />
              </button>
            )}
          </label>
          <button type="button" className="mb-fr" onClick={() => setPicking(true)}>
            <span className="fl">{t('phone.group')}</span>
            <span className="val">
              <span className="tx">{groupLabel(into.name)}</span>
              <Icon name="chevron" />
            </span>
          </button>
        </div>
        {entry && (
          <div className="mb-group apart">
            <button type="button" className="mb-fr red" onClick={onDelete}>
              {t('phone.deleteKey')}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** A group's name in a sheet: for a new group, or to rename one. */
function GroupSheet({ start, onSave, onClose }: { start: string | null; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(start ?? '');
  const title = start === null ? t('phone.newGroup') : t('phone.renameGroup');
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };
  return (
    <Sheet label={title} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{title}</b>
        <button type="button" className="ok" disabled={!name.trim()} onMouseDown={(event) => event.preventDefault()} onClick={() => save()}>
          {start === null ? t('keys.add') : t('keys.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" spellCheck={false} aria-label={t('keys.groupName')} placeholder={t('keys.groupName')} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * A keys file's table on a phone. `latest` is the file's text as it is now, for a change made
 * after a question; `adding` counts the presses of +, each opening a new key's sheet.
 */
export function PhoneKeysTable({ text, latest, change, actions, adding }: {
  text: string;
  latest: { current: string };
  change: (next: string) => void;
  actions: KeysActions;
  adding?: number;
}) {
  const groups = useMemo(() => parseKeys(text), [text]);
  const hold = useHold();
  // Secret values asked for stay shown until the file is closed, by group and key name.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: 'key'; group: GroupRef; entry: KeyEntry | null } | { kind: 'group'; group: GroupRef | null } | null>(null);
  const refs = groups.length > 0 ? groups.map(refOf) : [NO_GROUP];

  // + opens a new key's sheet, for the first group.
  useEffect(() => {
    if (adding) setSheet({ kind: 'key', group: refs[0]!, entry: null });
    // Only a press of + opens it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (id: string, value: string) => {
    const ok = await writeClipboard(value);
    setCopied(ok ? id : null);
    actions.notice?.(ok ? t('keys.copied') : t('keys.notCopied'));
  };
  const saveKey = (entry: KeyEntry | null, from: GroupRef, into: GroupRef, name: string, value: string) => {
    const now = latest.current;
    if (!entry) return change(addKey(now, into, name, value, 'last').text);
    if (sameRef(from, into)) return change(updateKey(now, entry, name, value));
    // To another group: out of this one, and in at the end of that one.
    const moved = addKey(removeKey(now, entry), into, name, value, 'last');
    if (moved.at) change(moved.text);
  };
  const deleteKey = (entry: KeyEntry) =>
    actions.ask(t('delete.key'), t('delete.keyText', { name: quote(entry.key) }), () => {
      setSheet(null);
      change(removeKey(latest.current, entry));
    });
  const deleteGroup = (group: KeyGroup) => {
    const remove = () => change(removeGroup(latest.current, refOf(group)));
    // An empty group goes without asking, as an empty column does.
    if (group.keys.length === 0) return remove();
    actions.ask(t('delete.group'), t('delete.groupWithKeys', { name: quote(groupLabel(group.name)), keys: t('count.keys', { count: group.keys.length }) }), remove);
  };
  const makeGroup = (name: string) => {
    const next = addGroup(latest.current, name);
    change(next);
    // A new group is there to put keys in: its first key's sheet opens at once.
    const made = parseKeys(next).at(-1);
    if (made && made.name === name) window.setTimeout(() => setSheet({ kind: 'key', group: refOf(made), entry: null }), 260);
  };
  const groupMenu = (group: KeyGroup, id: string) =>
    actions.menu(
      NO_POINTER,
      [
        { label: t('phone.addKey'), icon: 'plus', run: () => setSheet({ kind: 'key', group: refOf(group), entry: null }) },
        ...(group.keys.length > 0 ? [{ label: t('keys.copyGroup'), icon: 'copy' as const, run: () => void copy(id, groupText(latest.current, refOf(group))) }] : []),
        { label: t('menu.rename'), icon: 'pen', apart: true, run: () => setSheet({ kind: 'group', group: refOf(group) }) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => deleteGroup(group) },
      ],
      { icon: 'keys', title: groupLabel(group.name), sub: t('phone.groupOf', { keys: t('count.keys', { count: group.keys.length }) }) },
    );
  // A key held lifts over the dim, with what can be done with it.
  const keyMenu = (element: HTMLElement, group: KeyGroup, entry: KeyEntry, id: string) => {
    liftUntilTouch(element);
    actions.menu(
      NO_POINTER,
      [
        { label: t('keys.copyValue'), icon: 'copy', run: () => void copy(id, entry.value) },
        { label: t('keys.edit'), icon: 'pen', run: () => setSheet({ kind: 'key', group: refOf(group), entry }) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => deleteKey(entry) },
      ],
      { icon: 'keys', title: entry.key, sub: groupLabel(group.name) },
    );
  };

  // Groups and keys are told apart by name and by how many of that name came before, which does not change as lines move.
  const seen = new Map<string, number>();
  const idOf = (prefix: string, label: string) => {
    const n = seen.get(`${prefix}${label}`) ?? 0;
    seen.set(`${prefix}${label}`, n + 1);
    return `${prefix}${label}#${n}`;
  };

  const editing = sheet?.kind === 'key' ? sheet : null;
  const renaming = sheet?.kind === 'group' ? sheet : null;
  return (
    <div className="mb-klist">
      {groups.length === 0 ? (
        <Empty icon="keys" title={t('phone.noKeys')} text={t('phone.noKeysText')} action={{ label: t('phone.addKey'), run: () => setSheet({ kind: 'key', group: NO_GROUP, entry: null }) }} />
      ) : (
        groups.map((group) => {
          const id = idOf('g:', group.name ?? '');
          return (
            <div key={id} className="mb-kgrp">
              <div className="mb-kgh">
                <b className={group.name === null ? 'none' : undefined}>{groupLabel(group.name)}</b>
                <small>{group.keys.length}</small>
                <button type="button" className="more" aria-label={t('keys.groupMenu')} title={t('keys.groupMenu')} onClick={() => groupMenu(group, id)}>
                  ···
                </button>
              </div>
              <div className="mb-form mb-kform">
                <div className="mb-group">
                  {group.keys.map((entry) => {
                    const keyId = idOf(`${id}/`, entry.key);
                    const shownId = `${group.name ?? ''}\u0000${entry.key}`;
                    const secret = isSecret(entry);
                    const hidden = secret && !shown.has(shownId);
                    return (
                      <div key={keyId} className="mb-kv" {...hold((element) => keyMenu(element, group, entry, keyId))}>
                        <button type="button" className="kx" onClick={() => setSheet({ kind: 'key', group: refOf(group), entry })}>
                          <span className="kn">{entry.key}</span>
                          <span className={hidden ? 'kvv hid' : entry.value ? 'kvv' : 'kvv none'}>{hidden ? DOTS : entry.value || t('phone.emptyValue')}</span>
                        </button>
                        {secret && (
                          <button
                            type="button"
                            className={hidden ? 'kb' : 'kb on'}
                            aria-label={hidden ? t('keys.show') : t('keys.hide')}
                            title={hidden ? t('keys.show') : t('keys.hide')}
                            aria-pressed={!hidden}
                            onClick={() =>
                              setShown((now) => {
                                const next = new Set(now);
                                if (!next.delete(shownId)) next.add(shownId);
                                return next;
                              })
                            }
                          >
                            <Icon name={hidden ? 'eye' : 'eyeOff'} />
                          </button>
                        )}
                        <button type="button" className={copied === keyId ? 'kb on' : 'kb'} aria-label={t('keys.copyValue')} title={t('keys.copyValue')} onClick={() => void copy(keyId, entry.value)}>
                          <Icon name={copied === keyId ? 'check' : 'copy'} />
                        </button>
                      </div>
                    );
                  })}
                  {group.keys.length === 0 && (
                    <button type="button" className="mb-fr add" onClick={() => setSheet({ kind: 'key', group: refOf(group), entry: null })}>
                      <Icon name="plus" />
                      <span className="in">{t('phone.addKey')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div className="mb-form mb-kend">
        <div className="mb-group">
          <button type="button" className="mb-fr add" onClick={() => setSheet({ kind: 'group', group: null })}>
            <Icon name="plus" />
            <span className="in">{t('keys.addGroup')}</span>
          </button>
        </div>
      </div>
      {editing && (
        <KeySheet
          key={editing.entry ? `${editing.entry.line}\u0000${editing.entry.key}` : 'new'}
          groups={refs}
          group={editing.group}
          entry={editing.entry}
          revealed={!!editing.entry && shown.has(`${editing.group.name ?? ''}\u0000${editing.entry.key}`)}
          onSave={(into, name, value) => saveKey(editing.entry, editing.group, into, name, value)}
          onDelete={() => editing.entry && deleteKey(editing.entry)}
          onClose={() => setSheet(null)}
        />
      )}
      {renaming && (
        <GroupSheet
          start={renaming.group ? (renaming.group.name ?? '') : null}
          onSave={(name) => (renaming.group ? change(renameGroup(latest.current, renaming.group, name)) : makeGroup(name))}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
