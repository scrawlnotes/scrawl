import type { Card, CardFile } from '@scrawlnotes/core';
import {
  type EditorView,
  formatState,
  type FormatState,
  pickFiles,
  type ScrawlEditor,
  type ScrawlViewer,
  sizeText,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleLinePrefix,
  toggleList,
  toggleStrike,
} from '@scrawlnotes/editor';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { MenuItem } from './dialogs';
import { Thumb } from './Files';
import { Icon } from './Icon';
import { SpaceMentionList, useSpaceMentions } from './Mentions';
import type { SpacePeople } from './People';
import type { FileRow } from './session';
import { when } from './Activity';

// A card's description as a box, and the files attached to it under it, after Trello's card
// (design/card-attachments.html).

export type Viewer = (parent: HTMLElement, doc: string) => ScrawlViewer;

/** Markdown shown as it reads: a comment, a card's description. */
export function MarkdownView({ text, viewer }: { text: string; viewer: Viewer }) {
  const host = useRef<HTMLDivElement>(null);
  const shown = useRef<ScrawlViewer | null>(null);
  useEffect(() => {
    shown.current = viewer(host.current!, text);
    return () => {
      shown.current?.destroy();
      shown.current = null;
    };
    // Made once; the text is shown anew below when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    shown.current?.show(text);
  }, [text]);
  return <div className="md-view" ref={host} />;
}

/** What the description's tools do, as the note's format bar: marks, headings, then blocks. */
const TOOLS: { title: MessageKey; face: string; className?: string; on: (f: FormatState) => boolean; run: (view: EditorView) => boolean; gap?: true }[] = [
  { title: 'format.bold', face: 'B', className: 'fmt-bold', on: (f) => f.bold, run: (view) => toggleBold(view) },
  { title: 'format.italic', face: 'I', className: 'fmt-italic', on: (f) => f.italic, run: (view) => toggleItalic(view) },
  { title: 'format.strike', face: 'S', className: 'fmt-strike', on: (f) => f.strike, run: (view) => toggleStrike(view) },
  { title: 'format.code', face: '</>', on: (f) => f.code, run: (view) => toggleCode(view) },
  { title: 'format.h1', face: 'H1', on: (f) => f.heading === 1, run: (view) => toggleHeading(1)(view), gap: true },
  { title: 'format.h2', face: 'H2', on: (f) => f.heading === 2, run: (view) => toggleHeading(2)(view) },
  { title: 'format.h3', face: 'H3', on: (f) => f.heading === 3, run: (view) => toggleHeading(3)(view) },
  { title: 'format.listTitle', face: 'format.list', on: (f) => f.list, run: (view) => toggleList('bullet')(view), gap: true },
  { title: 'format.orderedTitle', face: 'format.ordered', on: (f) => f.ordered, run: (view) => toggleList('ordered')(view) },
  { title: 'format.quote', face: 'format.quote', on: (f) => f.quote, run: (view) => toggleLinePrefix('quote')(view) },
  { title: 'format.codeBlock', face: 'format.codeBlock', on: (f) => f.codeBlock, run: (view) => toggleCodeBlock(view) },
];

const MARKS = new Set(['B', 'I', 'S', '</>', 'H1', 'H2', 'H3']);

/** The description's format bar; a press keeps the cursor in the text. */
function DescriptionTools({ editor, format, onFormat }: { editor: React.RefObject<ScrawlEditor | null>; format: FormatState | null; onFormat: () => void }) {
  return (
    <div className="cd-tools" role="toolbar" aria-label={t('format.label')}>
      {TOOLS.map((tool) => (
        <span key={tool.title} className="cd-tool-slot">
          {tool.gap && <i className="cd-gap" />}
          <button
            type="button"
            className={['cd-tool', tool.className, format && tool.on(format) ? 'on' : ''].filter(Boolean).join(' ')}
            title={t(tool.title)}
            aria-label={t(tool.title)}
            aria-pressed={format ? tool.on(format) : false}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const view = editor.current?.view;
              if (!view) return;
              tool.run(view);
              view.focus();
              onFormat();
            }}
          >
            {MARKS.has(tool.face) ? tool.face : t(tool.face as MessageKey)}
          </button>
        </span>
      ))}
    </div>
  );
}

/** What the box needs of its card and of the app. */
export interface DescriptionBoxProps {
  home: string;
  card: Card;
  team: SpacePeople | null;
  viewer: Viewer;
  /** An editor for the description, in `parent`; files dropped or pasted in it go to `onFiles`. */
  editor: (parent: HTMLElement, doc: string, onChange: (doc: string) => void, onFiles: (files: File[]) => void) => ScrawlEditor;
  onSave: (description: string) => void;
  onFiles: (files: File[]) => void;
  /** On a phone: the description is written on a page of its own, over the card. */
  phone?: boolean;
}

/**
 * A card's description as a box: empty, it asks for one; written, it shows as it reads. A click
 * opens it for writing with its format bar, Save and Cancel; Ctrl or Cmd+Enter saves and Esc
 * cancels, Enter is a new line. What is written stays while it is open, a click elsewhere too, and
 * is saved if the card closes.
 */
export function DescriptionBox({ home, card, team, viewer, editor: makeEditor, onSave, onFiles, phone = false }: DescriptionBoxProps) {
  const [editing, setEditing] = useState(false);
  const text = card.description ?? '';
  const open = (event: MouseEvent) => {
    // A link or a file in it opens what it is, not the editor.
    if ((event.target as Element).closest('a, .cm-sl-link, .cm-sl-file, .cm-sl-img, img, button')) return;
    if ((window.getSelection()?.toString() ?? '') !== '') return;
    setEditing(true);
  };
  if (editing) {
    return (
      <DescriptionEditor
        home={home}
        text={text}
        team={team}
        editor={makeEditor}
        onFiles={onFiles}
        phone={phone}
        onDone={(written) => {
          if (written !== null && written.trim() !== text.trim()) onSave(written);
          setEditing(false);
        }}
        onLeave={(written) => written.trim() !== text.trim() && onSave(written)}
      />
    );
  }
  return (
    <div
      className={text ? 'cd-box full' : 'cd-box'}
      role="button"
      tabIndex={0}
      aria-label={text ? t('card.description') : t('card.descriptionHint')}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      {text ? <MarkdownView text={text} viewer={viewer} /> : <span className="cd-hint">{t('card.descriptionHint')}</span>}
    </div>
  );
}

/** The description open for writing: the box with its format bar, then Save and Cancel; on a phone a page over the card. */
function DescriptionEditor({ home, text, team, editor: makeEditor, onFiles, phone, onDone, onLeave }: {
  home: string;
  text: string;
  team: SpacePeople | null;
  editor: DescriptionBoxProps['editor'];
  onFiles: (files: File[]) => void;
  phone: boolean;
  /** What was written, to save; null to cancel. */
  onDone: (written: string | null) => void;
  /** It went while open, with the card: what was written, to keep. */
  onLeave: (written: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const written = useRef(text);
  const [format, setFormat] = useState<FormatState | null>(null);
  const mentions = useSpaceMentions(editor, team, home);
  const look = useRef(mentions.look);
  look.current = mentions.look;
  const filesTo = useRef(onFiles);
  filesTo.current = onFiles;
  const left = useRef(onLeave);
  left.current = onLeave;
  // Closed with the card while open: what was written is kept.
  const finished = useRef(false);
  const finish = (save: boolean) => {
    finished.current = true;
    onDone(save ? written.current : null);
  };
  const reformat = () => {
    const view = editor.current?.view;
    if (view) setFormat(formatState(view.state));
  };
  useEffect(() => {
    const made = makeEditor(
      host.current!,
      text,
      (doc) => {
        written.current = doc;
        window.setTimeout(() => look.current());
      },
      (files) => filesTo.current(files),
    );
    editor.current = made;
    made.view.contentDOM.setAttribute('aria-label', t('card.description'));
    // The cursor goes at the end of what is there, to go on writing.
    made.view.dispatch({ selection: { anchor: made.view.state.doc.length } });
    made.view.focus();
    reformat();
    return () => {
      if (!finished.current) left.current(written.current);
      made.destroy();
      editor.current = null;
    };
    // Made once, with the description as it was when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (mentions.onKeyDown(event)) return;
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    } else if (event.key === 'Escape') {
      // Esc cancels the writing, not the card it is on.
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  };
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
  const box = (
    <div className="cd-edit" onKeyDownCapture={onKeyDownCapture} onKeyUp={() => (reformat(), mentions.look())} onMouseUp={() => (reformat(), mentions.look())} onInput={mentions.look}>
      <DescriptionTools editor={editor} format={format} onFormat={reformat} />
      <div className="cd-text" ref={host} />
      <SpaceMentionList mentions={mentions} team={team} />
    </div>
  );
  if (phone) {
    return (
      <div className="cd-page" role="dialog" aria-label={t('card.description')}>
        <div className="cd-page-head">
          <button type="button" onClick={() => finish(false)}>
            {t('dialog.cancel')}
          </button>
          <b>{t('card.description')}</b>
          <button type="button" className="save" onClick={() => finish(true)}>
            {t('card.save')}
          </button>
        </div>
        {box}
      </div>
    );
  }
  return (
    <div className="cd-open">
      {box}
      <div className="cd-foot">
        <button type="button" className="primary" onMouseDown={(event) => event.preventDefault()} onClick={() => finish(true)}>
          {t('card.save')}
        </button>
        <button type="button" className="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => finish(false)}>
          {t('dialog.cancel')}
        </button>
        <span className="cd-keys">{t('card.descriptionKeys', { key: mod })}</span>
      </div>
    </div>
  );
}

/** A file on its way onto the card: how much of it is written, and what stops it. */
export interface Attaching {
  key: string;
  name: string;
  size: number;
  written: number;
  stop: AbortController;
}

/** What the Attachments do with a card's files. */
export interface CardFilesActions {
  /** Where an image shows from, and the file in the app, by its path in its space. */
  image: (src: string) => string | Promise<string>;
  pathOf: (src: string) => string;
  open: (file: CardFile) => void;
  /** In a browser: saved where downloads go; on the desktop app: shown in its folder; on a phone: shared. */
  download: (file: CardFile) => void;
  /** Says what that is here: Download, Show in folder or Share. */
  downloadLabel: string;
  rename: (file: CardFile) => void;
  remove: (file: CardFile) => void;
  /** Opens a menu at the pointer; on a phone an action sheet, headed by the file. */
  menu: (event: MouseEvent, file: CardFile, items: MenuItem[], picture: ReactNode) => void;
}

/**
 * The files attached to a card, the newest first: each its picture or its kind, its name, who
 * attached it, when and its size. A click opens it; Download and ··· show on hover, a phone has
 * ··· only. The files on their way show with how far they got and Stop. Add attachment picks more.
 */
export function Attachments({ card, today, nameOf, attaching, actions, onAdd, phone = false }: {
  card: Card;
  today: string;
  /** Who attached a file, by its stamp. */
  nameOf: (file: CardFile) => string | null;
  attaching: Attaching[];
  actions: CardFilesActions;
  onAdd: (files: File[]) => void;
  phone?: boolean;
}) {
  const files = [...(card.attachments ?? [])].reverse();
  const rowOf = (file: CardFile): FileRow => ({ path: actions.pathOf(file.path), name: file.path.slice(file.path.lastIndexOf('/') + 1), size: file.size ?? 0, added: null, named: false, away: false, uses: [], space: null });
  const picture = (file: CardFile) => <Thumb file={rowOf(file)} image={() => actions.image(file.path)} className="cd-thumb" />;
  const menuOf = (event: MouseEvent, file: CardFile) =>
    actions.menu(
      event,
      file,
      [
        { label: t('files.open'), icon: 'open', run: () => actions.open(file) },
        { label: actions.downloadLabel, icon: phone ? 'share' : 'download', run: () => actions.download(file) },
        { label: t('files.rename'), icon: 'pen', run: () => actions.rename(file) },
        { label: t('card.removeFile'), icon: 'trash', danger: true, apart: true, run: () => actions.remove(file) },
      ],
      picture(file),
    );
  return (
    <div className="cd-files">
      {attaching.map((each) => (
        <div key={each.key} className="cd-file going">
          <span className="cd-thumb doc" aria-hidden="true">
            <Icon name="file" />
          </span>
          <span className="cd-name">
            <b>{each.name}</b>
            <small>{t('card.attaching', { done: sizeText(each.written), size: sizeText(each.size) })}</small>
            <span className="cd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((100 * each.written) / Math.max(each.size, 1))}>
              <i style={{ width: `${(100 * each.written) / Math.max(each.size, 1)}%` }} />
            </span>
          </span>
          <button type="button" className="cd-stop" onClick={() => each.stop.abort()}>
            {t('card.stopAttaching')}
          </button>
        </div>
      ))}
      {files.map((file) => {
        const who = nameOf(file);
        return (
          <div key={file.id} className="cd-file" onContextMenu={(event) => (event.preventDefault(), menuOf(event, file))}>
            <button type="button" className="cd-open-file" title={file.name} onClick={() => actions.open(file)}>
              {picture(file)}
              <span className="cd-name">
                <b>{file.name}</b>
                <small>{[who, when(file.at, today), file.size !== undefined ? sizeText(file.size) : null].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
            <span className="cd-acts">
              {!phone && (
                <button type="button" title={actions.downloadLabel} aria-label={actions.downloadLabel} onClick={() => actions.download(file)}>
                  <Icon name="download" />
                </button>
              )}
              <button type="button" className="more" title={t('tasks.more')} aria-label={t('tasks.more')} onClick={(event) => menuOf(event, file)}>
                ···
              </button>
            </span>
          </div>
        );
      })}
      <button type="button" className="cd-add" onClick={() => pickFiles({ many: true }, onAdd)}>
        <Icon name="plus" />
        {t('card.addAttachment')}
      </button>
    </div>
  );
}
