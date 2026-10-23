import { editorTakesEnter, enterInEditor, type ScrawlEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Icon } from './Icon';

// A task's description, a card's or a record's notes: Markdown in the editor notes have, with its
// images and files, which are pasted, dropped, or chosen with Attach. They go to the attachments
// of the space of what they belong to, `home`: a task list, a board or a collection.

/** What makes a description's editor and puts files in it. */
export interface DescriptionHost {
  /** Opens the editor of a description in `parent`, wired to the files of the space `home` is in. */
  editor: (home: string, parent: HTMLElement, doc: string, onChange: (doc: string) => void, hint?: string) => ScrawlEditor;
  /** Copies files into a description's editor, where its cursor is. */
  attach: (editor: ScrawlEditor, home: string, files: File[]) => void;
}

/** Attach: files chosen with it go into the description. The focus stays where it was. A chip of a bar has only its icon. */
export function AttachButton({ onFiles, className = 'attach', iconOnly = false }: { onFiles: (files: File[]) => void; className?: string; iconOnly?: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        title={iconOnly ? t('editor.attach') : undefined}
        aria-label={iconOnly ? t('editor.attach') : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => picker.current?.click()}
      >
        <Icon name="clip" />
        {!iconOnly && t('editor.attach')}
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}

/**
 * A description in its editor, with Attach under it. It is made once with `value`; what is typed
 * goes to `onChange`. Escape in it is the host's, to cancel. With `onEnter`, Enter is the host's
 * too, to save, and Ctrl+Enter is a new line, unless a list the editor opened takes Enter. With
 * `attacher`, Attach is the host's, in a bar of its own: files given to it go into the editor.
 */
export function DescriptionField({ home, value, onChange, hint, host, autoFocus, onEscape, onEnter, attacher }: {
  home: string;
  value: string;
  onChange: (doc: string) => void;
  hint: string;
  host: DescriptionHost;
  autoFocus?: boolean;
  onEscape?: () => void;
  onEnter?: () => void;
  attacher?: { current: ((files: File[]) => void) | null };
}) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    const made = host.editor(home, box.current!, value, (doc) => changed.current(doc), hint);
    editor.current = made;
    if (autoFocus) made.view.focus();
    return () => {
      made.destroy();
      editor.current = null;
    };
    // Made once, with the description it opened with; what is typed in it is the draft's from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const attach = (files: File[]) => editor.current && host.attach(editor.current, home, files);
  if (attacher) attacher.current = attach;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !onEscape) return;
    event.preventDefault();
    onEscape();
  };
  // Before the editor has the key: Enter saves, Ctrl+Enter is the editor's own Enter.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const view = editor.current?.view;
    if (!onEnter || !view || event.key !== 'Enter' || event.shiftKey || event.altKey || event.nativeEvent.isComposing || editorTakesEnter(view)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) enterInEditor(view);
    else onEnter();
  };
  return (
    <div className="desc-field" onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture}>
      <div className="desc-box" ref={box} />
      {!attacher && <AttachButton onFiles={attach} />}
    </div>
  );
}
