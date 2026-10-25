import { type AppPiece, type EditScreen, type MenuEdit, pieceName, screenKey } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { Dialog, type MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { Sheet } from './sheets';

// Edit menu (design/app-home.md 6): the app's modules on the left, the chosen one's screens on the
// right, both put in order by their handles and renamed where they are; a screen hidden with its
// eye, moved to another module by dropping it on that module, given the view it opens on; what
// Home shows; the lines and what is in the folder but in no menu, said under them. A screen's new
// name is its collection's or its board's, everywhere. Save writes it all at once. On a phone a
// sheet: the modules, then a module's screens on a page of their own.

/** What Edit menu saves: the menu, or null for the templates' again; and the screens given a new name, by path. */
export interface MenuSave {
  edit: MenuEdit | null;
  renames: { path: string; name: string }[];
}

type Module = MenuEdit['modules'][number];

/** A row being dragged by its handle: which list, which row, where the pointer is, and where it would go. */
interface Drag {
  kind: 'module' | 'screen';
  key: string;
  /** Its place among its rows when it was taken. */
  from: number;
  dy: number;
  /** Its place among its rows if let go now. */
  to: number;
  /** A module the screen is over, to go into. */
  into: string | null;
}

const listed = (items: string[]) => new Intl.ListFormat(locale(), { type: 'conjunction' }).format(items);
const screenIcon = (screen: AppPiece): IconName => (screen.kind === 'board' ? 'board' : screen.kind === 'note' ? 'note' : screen.kind === 'folder' ? 'folder' : 'collection');
/** A menu as it would be written, to tell whether anything changed. */
const shape = (edit: MenuEdit) => JSON.stringify({ home: edit.home, modules: edit.modules.map((m) => [m.name, m.template, m.screens.map((s) => [s.path, s.view, s.hidden])]) });

export function AppMenuDialog({ name, start, templates, pieces, lines, views, phone, onMenu, onSave, onClose }: {
  /** The app's name. */
  name: string;
  /** Its menu as it is. */
  start: MenuEdit;
  /** The templates' menu, for Reset to template; null when there is none to go back to. */
  templates: MenuEdit | null;
  /** The collections and boards in its folder that may be screens: lines left out. */
  pieces: AppPiece[];
  /** Its collections that are another's lines, each with the name of the one whose lines they are. */
  lines: { path: string; name: string; owner: string }[];
  /** A collection's views, for the one a screen opens on. */
  views: (path: string) => { id: string; name: string }[];
  phone: boolean;
  onMenu: (event: MouseEvent, items: MenuItem[]) => void;
  /** Writes it; a message when it could not be. */
  onSave: (save: MenuSave) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MenuEdit>(() => structuredClone(start));
  const [reset, setReset] = useState(false);
  // Screens given a new name, by path: the name of their collection or board when saved.
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [picked, setPicked] = useState<string>(() => start.modules[0]?.key ?? '');
  // On a phone the module whose screens are shown on a page of their own.
  const [page, setPage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ kind: 'module' | 'screen'; key: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef<Drag | null>(null);
  const cancelled = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const fresh = useRef(0);

  const change = (next: MenuEdit) => {
    setDraft(next);
    setReset(false);
    setError(null);
  };
  const withModule = (key: string, fn: (m: Module) => Module) => change({ ...draft, modules: draft.modules.map((m) => (m.key === key ? fn(m) : m)) });
  const module = draft.modules.find((m) => m.key === (phone ? page : picked)) ?? (phone ? null : draft.modules[0]) ?? null;
  const nameOf = (s: AppPiece & { name?: string }) => names.get(s.path) ?? s.name ?? pieceName(s);
  const moduleName = (m: Module) => m.name || t('app.screens');
  const dirty = reset || names.size > 0 || shape(draft) !== shape(start);

  const addModule = () => {
    const key = `new-${++fresh.current}`;
    change({ ...draft, modules: [...draft.modules, { key, name: t('appMenu.newModule'), screens: [] }] });
    setPicked(key);
    setRenaming({ kind: 'module', key });
  };
  // A module taken away gives its screens to the first that is left.
  const deleteModule = (key: string) => {
    const gone = draft.modules.find((m) => m.key === key)!;
    const left = draft.modules.filter((m) => m.key !== key);
    const first = left[0]!;
    const into = { ...first, screens: [...first.screens, ...gone.screens.filter((s) => !first.screens.some((f) => screenKey(f) === screenKey(s)))] };
    change({ ...draft, modules: [into, ...left.slice(1)] });
    setPicked(into.key);
    setPage(null);
  };
  // Hidden is the screen's, wherever it is: in no menu.
  const toggleHidden = (s: EditScreen) => change({ ...draft, modules: draft.modules.map((m) => ({ ...m, screens: m.screens.map((x) => (x.path === s.path ? { ...x, hidden: !s.hidden } : x)) })) });
  const moveScreenTo = (from: string, s: EditScreen, to: string) => {
    if (from === to) return;
    change({
      ...draft,
      modules: draft.modules.map((m) =>
        m.key === from ? { ...m, screens: m.screens.filter((x) => screenKey(x) !== screenKey(s)) } : m.key === to && !m.screens.some((x) => screenKey(x) === screenKey(s)) ? { ...m, screens: [...m.screens, s] } : m,
      ),
    });
  };
  const addScreen = (piece: AppPiece, view?: string) => {
    if (!module) return;
    const screen: EditScreen = { ...piece, name: pieceName(piece), ...(view && { view }), hidden: draft.modules.some((m) => m.screens.some((s) => s.path === piece.path && s.hidden)) };
    if (module.screens.some((s) => screenKey(s) === screenKey(screen))) return;
    withModule(module.key, (m) => ({ ...m, screens: [...m.screens, screen] }));
  };
  const setView = (m: Module, s: EditScreen, view: string | undefined) =>
    withModule(m.key, (x) => ({ ...x, screens: x.screens.map((y) => (screenKey(y) === screenKey(s) ? { ...y, view } : y)) }));
  const renameScreen = (path: string, to: string) => {
    const piece = draft.modules.flatMap((m) => m.screens).find((s) => s.path === path);
    setNames((now) => {
      const next = new Map(now);
      if (!to.trim() || to.trim() === piece?.name) next.delete(path);
      else next.set(path, to.trim());
      return next;
    });
    setError(null);
  };

  // A screen is in other modules: said under its name, and it may be taken out of this one.
  const elsewhere = (m: Module, s: EditScreen) => draft.modules.filter((x) => x.key !== m.key && x.screens.some((y) => y.path === s.path)).map(moduleName);
  const smallOf = (m: Module, s: EditScreen) => {
    const view = s.view ? views(s.path).find((v) => v.id === s.view) : undefined;
    const others = elsewhere(m, s);
    return [view && t('appMenu.opensOn', { view: view.name }), others.length > 0 && t('appMenu.alsoIn', { modules: listed(others) })].filter(Boolean).join(' · ');
  };
  const screenMenu = (event: MouseEvent, m: Module, s: EditScreen) => {
    const own = views(s.path);
    const others = draft.modules.filter((x) => x.key !== m.key);
    onMenu(event, [
      { label: t('menu.rename'), icon: 'pen', run: () => setRenaming({ kind: 'screen', key: screenKey(s) }) },
      ...(s.kind === 'collection' && own.length > 0
        ? [
            {
              label: t('appMenu.opensOnMenu'),
              icon: 'eye' as const,
              value: s.view ? (own.find((v) => v.id === s.view)?.name ?? '') : t('appMenu.lastView'),
              run: () => undefined,
              items: [{ label: t('appMenu.lastView'), checked: !s.view, run: () => setView(m, s, undefined) }, ...own.map((v) => ({ label: v.name, checked: s.view === v.id, run: () => setView(m, s, v.id) }))],
            },
          ]
        : []),
      ...(others.length > 0 ? [{ label: t('appMenu.moveTo'), icon: 'move' as const, run: () => undefined, items: others.map((x) => ({ label: moduleName(x), run: () => moveScreenTo(m.key, s, x.key) })) }] : []),
      { label: t(s.hidden ? 'appMenu.show' : 'appMenu.hide'), icon: s.hidden ? ('eye' as const) : ('eyeOff' as const), run: () => toggleHidden(s) },
      // Out of this module: a screen another module has too, or one the person made, which then waits under the folder's.
      ...(elsewhere(m, s).length > 0 || !s.role
        ? [{ label: t('appMenu.takeOut', { module: moduleName(m) }), icon: 'close' as const, apart: true, run: () => withModule(m.key, (x) => ({ ...x, screens: x.screens.filter((y) => screenKey(y) !== screenKey(s)) })) }]
        : []),
    ]);
  };
  const moduleMenu = (event: MouseEvent, m: Module) =>
    onMenu(event, [
      { label: t('menu.rename'), icon: 'pen', run: () => setRenaming({ kind: 'module', key: m.key }) },
      ...(draft.modules.length > 1 ? [{ label: t('appMenu.deleteModule'), icon: 'trash' as const, danger: true, apart: true, run: () => deleteModule(m.key) }] : []),
    ]);
  // Add screen: a collection or a board in the folder that is not in this module, a collection with views opening on one.
  const addMenu = (event: MouseEvent) => {
    const here = new Set(module?.screens.map((s) => s.path) ?? []);
    const items = pieces
      .filter((p) => !here.has(p.path))
      .sort((a, b) => pieceName(a).localeCompare(pieceName(b)))
      .map((p): MenuItem => {
        const own = p.kind === 'collection' ? views(p.path) : [];
        return own.length > 0
          ? { label: pieceName(p), icon: screenIcon(p), run: () => undefined, items: [{ label: t('appMenu.lastView'), run: () => addScreen(p) }, ...own.map((v) => ({ label: v.name, run: () => addScreen(p, v.id) }))] }
          : { label: pieceName(p), icon: screenIcon(p), run: () => addScreen(p) };
      });
    onMenu(event, items.length > 0 ? items : [{ label: t('appMenu.nothingToAdd'), disabled: t('appMenu.nothingToAddWhy'), run: () => undefined }]);
  };

  // Dragged by its handle: the rows of its list are where it may go; a screen let go over a module goes into it.
  const startDrag = (event: PointerEvent, kind: Drag['kind'], key: string, list: HTMLElement | null) => {
    if (!list) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-row]')];
    const from = rows.findIndex((r) => r.dataset.row === key);
    const mids = rows.map((r) => {
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const y0 = event.clientY;
    const show = (next: Drag | null) => {
      dragging.current = next;
      setDrag(next);
    };
    const move = (e: globalThis.PointerEvent) => {
      const to = Math.max(0, mids.filter((mid) => mid < e.clientY).length - (mids[from]! < e.clientY ? 1 : 0));
      const over = kind === 'screen' && !phone ? (document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-module]')?.dataset.module ?? null) : null;
      show({ kind, key, from, dy: e.clientY - y0, to, into: over && over !== picked ? over : null });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const done = dragging.current;
      show(null);
      if (done) drop(done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    show({ kind, key, from, dy: 0, to: from, into: null });
  };
  const drop = (done: Drag) => {
    const { from } = done;
    const reorder = <T,>(list: T[]) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(done.to, 0, moved!);
      return next;
    };
    if (done.kind === 'module') {
      if (done.to !== from) change({ ...draft, modules: reorder(draft.modules) });
      return;
    }
    if (!module) return;
    const screen = module.screens[from];
    if (done.into && screen) moveScreenTo(module.key, screen, done.into);
    else if (done.to !== from) withModule(module.key, (m) => ({ ...m, screens: reorder(m.screens) }));
  };
  const dragged = (kind: Drag['kind'], key: string, index: number) => {
    if (!drag || drag.kind !== kind) return undefined;
    if (drag.key === key) return { className: 'drag', style: { transform: `translateY(${drag.dy}px)` } };
    return drag.to === index && drag.to !== drag.from && !drag.into ? { className: drag.to < drag.from ? 'drop up' : 'drop down' } : undefined;
  };
  const handle = (kind: Drag['kind'], key: string, list: () => HTMLElement | null) => (
    <span
      className="am-grip"
      aria-hidden="true"
      onPointerDown={(event) => startDrag(event, kind, key, list())}
      // On a phone the sheet is not pulled down by it.
      onTouchStart={(event) => event.stopPropagation()}
    >
      ⋮⋮
    </span>
  );

  /** A name typed in where it is: Enter or leaving keeps it, Esc goes back. */
  const nameBox = (value: string, done: (to: string) => void) => (
    <input
      className="am-name"
      autoFocus
      defaultValue={value}
      aria-label={t('menu.rename')}
      onFocus={(event) => {
        cancelled.current = false;
        event.target.select();
      }}
      onBlur={(event) => {
        if (!cancelled.current) done(event.target.value);
        setRenaming(null);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        else if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );

  const modulesList = useRef<HTMLDivElement>(null);
  const screensList = useRef<HTMLDivElement>(null);
  const homeSays = draft.home.today && draft.home.cards ? t('appMenu.homeAll') : draft.home.today ? t('appMenu.homeToday') : draft.home.cards ? t('appMenu.homeCards') : t('appMenu.homeNone');
  const shown = (m: Module) => m.screens.filter((s) => !s.hidden).length;

  const moduleRows = (
    <div className="am-mods" ref={modulesList}>
      {draft.modules.map((m, i) => {
        const on = !phone && m.key === module?.key;
        const look = dragged('module', m.key, i);
        return (
          <div
            key={m.key}
            data-row={m.key}
            data-module={m.key}
            className={['am-row', on && 'on', !m.name && 'unnamed', look?.className, drag?.into === m.key && 'into'].filter(Boolean).join(' ')}
            style={look?.style}
            role="button"
            tabIndex={0}
            onClick={() => (phone ? setPage(m.key) : setPicked(m.key))}
            onDoubleClick={() => !phone && setRenaming({ kind: 'module', key: m.key })}
            onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && (phone ? setPage(m.key) : setPicked(m.key))}
            onContextMenu={(event) => {
              event.preventDefault();
              moduleMenu(event, m);
            }}
          >
            {handle('module', m.key, () => modulesList.current)}
            {renaming?.kind === 'module' && renaming.key === m.key ? (
              nameBox(m.name, (to) => withModule(m.key, (x) => ({ ...x, name: to.trim() })))
            ) : (
              <span className="t">{moduleName(m)}</span>
            )}
            <small>{t('app.screenCount', { count: shown(m) })}</small>
            {phone ? (
              <Icon name="chevron" />
            ) : (
              <button type="button" className="am-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => (event.stopPropagation(), moduleMenu(event, m))}>
                ···
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="am-row am-plus" onClick={addModule}>
        <Icon name="plus" />
        {t('appMenu.addModule')}
      </button>
    </div>
  );
  const homeOptions = (
    <div className="am-home">
      <label className="fcheck">
        <input type="checkbox" checked={draft.home.today} onChange={(event) => change({ ...draft, home: { ...draft.home, today: event.target.checked } })} />
        {t('appMenu.todayOnHome')}
      </label>
      <label className="fcheck">
        <input type="checkbox" checked={draft.home.cards} onChange={(event) => change({ ...draft, home: { ...draft.home, cards: event.target.checked } })} />
        {t('appMenu.cardsOnHome')}
      </label>
    </div>
  );
  const unplaced = pieces.filter((p) => !draft.modules.some((m) => m.screens.some((s) => s.path === p.path)));
  const below = (
    <>
      {lines.length > 0 && (
        <>
          <div className="am-sub">{t('appMenu.lines')}</div>
          <div className="am-faint">
            {lines.map((l) => (
              <span key={l.path}>
                <Icon name="collection" />
                {l.name} · {t('appMenu.linesOf', { owner: l.owner })}
              </span>
            ))}
          </div>
        </>
      )}
      {unplaced.length > 0 && (
        <>
          <div className="am-sub">{t('appMenu.unplaced')}</div>
          <div className="am-faint">
            {unplaced.map((p) => (
              <button key={p.path} type="button" disabled={!module} onClick={() => addScreen(p)}>
                <Icon name={screenIcon(p)} />
                {pieceName(p)}
                {!p.role && <> · {t('appMenu.madeByYou')}</>}
                <span className="add">{module ? t('appMenu.addTo', { module: moduleName(module) }) : ''}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
  const screenRows = module && (
    <>
      {!phone && <div className="am-sub top">{t('appMenu.screensOf', { module: moduleName(module) })}</div>}
      <div className="am-scr" ref={screensList}>
        {module.screens.map((s, i) => {
          const key = screenKey(s);
          const look = dragged('screen', key, i);
          const small = smallOf(module, s);
          return (
            <div
              key={key}
              data-row={key}
              className={['am-row', s.hidden && 'off', look?.className].filter(Boolean).join(' ')}
              style={look?.style}
              onContextMenu={(event) => {
                event.preventDefault();
                screenMenu(event, module, s);
              }}
            >
              {handle('screen', key, () => screensList.current)}
              <Icon name={screenIcon(s)} />
              {renaming?.kind === 'screen' && renaming.key === key ? (
                nameBox(nameOf(s), (to) => renameScreen(s.path, to))
              ) : (
                <span className="t" onDoubleClick={() => setRenaming({ kind: 'screen', key })}>
                  {nameOf(s)}
                </span>
              )}
              {small && <small>{small}</small>}
              <button type="button" className="am-eye" title={t(s.hidden ? 'appMenu.show' : 'appMenu.hide')} aria-label={t(s.hidden ? 'appMenu.show' : 'appMenu.hide')} aria-pressed={s.hidden} onClick={() => toggleHidden(s)}>
                <Icon name={s.hidden ? 'eyeOff' : 'eye'} />
              </button>
              <button type="button" className="am-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => screenMenu(event, module, s)}>
                ···
              </button>
            </div>
          );
        })}
        {module.screens.length === 0 && <p className="am-none">{t('appMenu.noScreens')}</p>}
      </div>
      <button type="button" className="am-row am-plus" onClick={addMenu}>
        <Icon name="plus" />
        {t('appMenu.addScreen')}
      </button>
    </>
  );

  const save = async () => {
    if (busy.current || !dirty) return;
    busy.current = true;
    const renames = [...names].map(([path, to]) => ({ path, name: to }));
    const failed = await onSave({ edit: reset ? null : draft, renames });
    busy.current = false;
    if (failed) setError(failed);
  };
  const resetToTemplates = () => {
    if (!templates) return;
    setDraft(structuredClone(templates));
    setReset(true);
    setPicked(templates.modules[0]?.key ?? '');
    setPage(null);
  };
  const problem: ReactNode = error && (
    <p className="am-error" role="alert">
      {error}
    </p>
  );

  if (phone) {
    const inModule = page !== null && module !== null;
    return (
      <Sheet label={t('appMenu.title')} className="mb-create am-sheet" onClose={onClose} onEscape={() => (inModule ? setPage(null) : onClose())}>
        <div className="mb-sh three">
          <button type="button" className={inModule ? 'cancel back' : 'cancel'} onClick={() => (inModule ? setPage(null) : onClose())}>
            {inModule && <Icon name="back" />}
            {inModule ? t('appMenu.title') : t('dialog.cancel')}
          </button>
          <b>{inModule ? moduleName(module) : t('appMenu.title')}</b>
          <button type="button" className={dirty ? 'ok' : 'ok off'} disabled={!dirty} onClick={() => void save()}>
            {t('apps.save')}
          </button>
        </div>
        <div className="am-body">
          {inModule ? (
            <>
              {screenRows}
              {below}
              <div className="am-acts">
                <button type="button" onClick={() => setRenaming({ kind: 'module', key: module.key })}>
                  {t('appMenu.renameModule')}
                </button>
                {draft.modules.length > 1 && (
                  <button type="button" className="danger" onClick={() => deleteModule(module.key)}>
                    {t('appMenu.deleteModule')}
                  </button>
                )}
              </div>
              {renaming?.kind === 'module' && renaming.key === module.key && <div className="am-rename">{nameBox(module.name, (to) => withModule(module.key, (x) => ({ ...x, name: to.trim() })))}</div>}
            </>
          ) : (
            <>
              <div className="am-sub top">{name}</div>
              {moduleRows}
              <div className="am-sub">{t('app.home')}</div>
              {homeOptions}
              {lines.length > 0 && below}
              {templates && (
                <button type="button" className="am-reset" onClick={resetToTemplates}>
                  {t('appMenu.reset')}
                </button>
              )}
            </>
          )}
          {problem}
        </div>
      </Sheet>
    );
  }

  return (
    <Dialog label={t('appMenu.title')} className="am-dialog" onClose={onClose}>
      <div className="am-hd">
        <b>{t('appMenu.title')}</b>
        <small>{name}</small>
        <button type="button" className="am-x" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="am-cols">
        <div className="am-left">
          <div className="am-row fixed">
            <Icon name="app" />
            <span className="t">{t('app.home')}</span>
            <small>{homeSays}</small>
          </div>
          {moduleRows}
          {homeOptions}
        </div>
        <div className="am-right">
          {screenRows}
          {below}
        </div>
      </div>
      {problem}
      <div className="am-foot">
        {templates && (
          <button type="button" className="am-reset" onClick={resetToTemplates}>
            {t('appMenu.reset')}
          </button>
        )}
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!dirty} onClick={() => void save()}>
          {t('apps.save')}
        </button>
      </div>
    </Dialog>
  );
}
