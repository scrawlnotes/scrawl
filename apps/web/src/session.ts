import {
  ATTACHMENTS,
  createFolder,
  createScratchNote,
  dirname,
  displayTitle,
  INBOX,
  loadWorkspace,
  moveNote,
  readTree,
  renameNote,
  saveAttachment,
  saveWorkspace,
  trashNote,
  type TreeNode,
  type VaultFs,
} from '@scrawlnotes/core';
import {
  createEditor,
  type EditorState,
  type EditorStats,
  type FormatState,
  formatState,
  type ScrawlEditor,
  setLink,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleLinePrefix,
  toggleStrike,
} from '@scrawlnotes/editor';
import { boardOf, isNote, tasksOf } from './items';
import { sampleDoc } from './sample';
import { chooseVaultFolder, isDesktop, openVault, vaultFolder } from './storage';

const SAVE_DELAY_MS = 400;

const formatCommands = {
  bold: toggleBold,
  italic: toggleItalic,
  strike: toggleStrike,
  code: toggleCode,
  h1: toggleHeading(1),
  h2: toggleHeading(2),
  h3: toggleHeading(3),
  list: toggleLinePrefix('list'),
  quote: toggleLinePrefix('quote'),
  codeBlock: toggleCodeBlock,
};
export type FormatAction = keyof typeof formatCommands;

export interface Snapshot {
  ready: boolean;
  /** Desktop only: no notes folder has been chosen yet. */
  needsFolder: boolean;
  /** Desktop only: the folder the notes are in. */
  folder: string | null;
  tree: TreeNode[];
  tabs: string[];
  active: string | null;
  /** Display name of every note, kept current while a note is being typed. */
  titles: Record<string, string>;
  saved: boolean;
  /** Cursor and formatting of the note on screen; null while a view is shown instead. */
  stats: EditorStats | null;
  format: FormatState | null;
  source: boolean;
}

function titlesOf(nodes: TreeNode[], out: Record<string, string> = {}): Record<string, string> {
  for (const node of nodes) {
    if (node.kind === 'note') out[node.path] = node.title ?? 'untitled';
    else titlesOf(node.children ?? [], out);
  }
  return out;
}

/**
 * The open vault and its editor: which notes are open, what is unsaved, and every action the
 * interface offers. React renders from `getSnapshot` and calls the methods.
 */
export class Session {
  private snapshot: Snapshot = {
    ready: false,
    needsFolder: false,
    folder: null,
    tree: [],
    tabs: [],
    active: null,
    titles: {},
    saved: true,
    stats: null,
    format: null,
    source: false,
  };
  private readonly listeners = new Set<() => void>();
  private fs!: VaultFs;
  private editor: ScrawlEditor | null = null;
  /** Editing state of each open note that is not on screen, undo history included. */
  private readonly states = new Map<string, EditorState>();
  private readonly pending = new Map<string, string>();
  /** The text of each open note as it was last read from or written to the vault. */
  private readonly disk = new Map<string, string>();
  /** Set while a change made outside the app is being put into the editor. */
  private external = false;
  private readonly images = new Map<string, string>();
  private timer = 0;
  /** Identifies the current start; a start that was disposed while loading must not finish. */
  private run = 0;
  private parent: HTMLElement | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async start(parent: HTMLElement) {
    const run = ++this.run;
    this.parent = parent;
    const fs = await openVault();
    if (!fs) {
      if (run === this.run) this.set({ needsFolder: true });
      return;
    }
    this.fs = fs;
    for (const entry of await this.fs.list(ATTACHMENTS)) {
      this.images.set(entry.path, URL.createObjectURL(await this.fs.readBlob(entry.path)));
    }
    let tree = await readTree(this.fs);
    // The browser vault starts with a sample note. A folder on disk is the user's own; nothing is put there unasked.
    if (!tree.length && !isDesktop) {
      await this.fs.mkdir(INBOX);
      await this.fs.writeText('Scrawl/Sync engine open questions.md', sampleDoc);
      tree = await readTree(this.fs);
    }
    const workspace = await loadWorkspace(this.fs);
    if (run !== this.run) return;

    this.editor = createEditor({
      parent,
      resolveImage: (src) => this.images.get(src) ?? src,
      saveImage: async (file) => {
        const path = await saveAttachment(this.fs, file);
        this.images.set(path, URL.createObjectURL(file));
        return path;
      },
      onStats: (stats) => this.set({ stats, format: this.editor ? formatState(this.editor.view.state) : null }),
      onChange: (doc) => this.changed(doc),
    });
    window.addEventListener('pagehide', this.flush);

    const titles = titlesOf(tree);
    const tabs = workspace.tabs.filter((id) => id in titles || !isNote(id));
    this.set({ ready: true, needsFolder: false, folder: vaultFolder(), tree, titles, tabs });
    // With no tabs from last time nothing is opened: the interface asks what to create.
    const first = workspace.active && tabs.includes(workspace.active) ? workspace.active : tabs[0];
    if (first) await this.open(first);
  }

  dispose() {
    this.run++;
    window.removeEventListener('pagehide', this.flush);
    if (!this.editor) return;
    void this.flush();
    this.editor.destroy();
    this.editor = null;
    this.states.clear();
    this.set({ ready: false, active: null });
  }

  private changed(doc: string) {
    const path = this.snapshot.active;
    // Text that just came from the file is not an edit to save back.
    if (!path || !isNote(path) || this.external) return;
    this.pending.set(path, doc);
    const title = displayTitle(path, doc);
    const titles = this.snapshot.titles[path] === title ? this.snapshot.titles : { ...this.snapshot.titles, [path]: title };
    this.set({ saved: false, titles });
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(this.flush, SAVE_DELAY_MS);
  }

  /** Writes every unsaved note to the vault. */
  flush = async () => {
    window.clearTimeout(this.timer);
    const writes = [...this.pending];
    this.pending.clear();
    await Promise.all(
      writes.map(async ([path, doc]) => {
        await this.fs.writeText(path, doc);
        this.disk.set(path, doc);
      }),
    );
    if (!this.pending.size && !this.snapshot.saved) this.set({ saved: true });
  };

  private saveWorkspace() {
    void saveWorkspace(this.fs, { tabs: this.snapshot.tabs, active: this.snapshot.active });
  }

  /** Desktop: asks for the notes folder and opens it. Open notes are saved and closed first. */
  async chooseFolder() {
    if (!this.parent || !(await chooseVaultFolder())) return;
    const parent = this.parent;
    await this.flush();
    this.dispose();
    this.set({ tabs: [], tree: [], titles: {} });
    await this.start(parent);
  }

  /**
   * Picks up what changed outside the app: notes that were added, renamed or removed, and open
   * notes whose file was edited in another program.
   */
  async rescan() {
    if (!this.snapshot.ready) return;
    await this.flush();
    for (const path of this.snapshot.tabs) {
      // A note with edits that are not saved yet keeps them; they are written on the next save.
      if (!isNote(path) || this.pending.has(path)) continue;
      let text: string;
      try {
        text = await this.fs.readText(path);
      } catch {
        continue;
      }
      if (text === this.disk.get(path)) continue;
      this.disk.set(path, text);
      const view = path === this.snapshot.active ? this.editor?.view : undefined;
      if (!view) {
        // Not on screen: it is read again when its tab is opened.
        this.states.delete(path);
        continue;
      }
      this.external = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: Math.min(view.state.selection.main.head, text.length) },
        });
      } finally {
        this.external = false;
      }
    }
    await this.refreshTree();
  }

  private async refreshTree() {
    await this.flush();
    const tree = await readTree(this.fs);
    this.set({ tree, titles: titlesOf(tree) });
  }

  /** Shows a note or a view, adding a tab for it when it has none. */
  async open(id: string) {
    const editor = this.editor;
    if (!editor) return;
    const { active, tabs } = this.snapshot;
    if (id !== active) {
      if (active && isNote(active)) this.states.set(active, editor.view.state);
      const openTabs = tabs.includes(id) ? tabs : [...tabs, id];
      if (isNote(id)) {
        let state = this.states.get(id);
        if (!state) {
          const text = await this.fs.readText(id);
          this.disk.set(id, text);
          state = editor.createState(text);
        }
        this.states.delete(id);
        // Set before the editor reports its new state, so the report is attributed to this note.
        this.set({ active: id, tabs: openTabs });
        editor.setState(state);
        // Source mode is one setting for the whole window, not per note.
        editor.setSourceMode(this.snapshot.source);
      } else {
        this.set({ active: id, tabs: openTabs, stats: null, format: null });
      }
      this.saveWorkspace();
    }
    // Deferred: the editor is still hidden when it replaces a view, and a hidden element cannot take focus.
    if (isNote(id)) window.setTimeout(() => this.editor?.view.focus());
  }

  /** Creates an empty note in `folder`, or in the inbox, and opens it. */
  async newNote(folder?: string) {
    const path = await createScratchNote(this.fs, new Date(), folder);
    await this.refreshTree();
    await this.open(path);
  }

  /** The folder new things are created in: the one the tab on screen belongs to, else the inbox. */
  private currentFolder(): string {
    const { active } = this.snapshot;
    if (!active) return INBOX;
    return (isNote(active) ? dirname(active) : active.slice(active.indexOf(':') + 1)) || INBOX;
  }

  /** Opens the task list or board of the current folder. Both are placeholders until they are built. */
  async newItem(kind: 'tasks' | 'board') {
    const folder = this.currentFolder();
    await this.open(kind === 'tasks' ? tasksOf(folder) : boardOf(folder));
  }

  /** Takes a note out of the tab bar and shows a neighbor. Closing the last tab leaves nothing open. */
  private async detach(path: string) {
    const { tabs, active } = this.snapshot;
    const index = tabs.indexOf(path);
    if (index < 0) return;
    const rest = tabs.filter((tab) => tab !== path);
    this.states.delete(path);
    if (path !== active) {
      this.set({ tabs: rest });
      this.saveWorkspace();
      return;
    }
    this.set({ tabs: rest, active: null });
    const next = rest[index] ?? rest[index - 1];
    if (next) await this.open(next);
    else {
      this.set({ stats: null, format: null });
      this.saveWorkspace();
    }
  }

  async close(path: string) {
    await this.flush();
    const state = path === this.snapshot.active ? this.editor?.view.state : this.states.get(path);
    // An inbox note that was never written in leaves nothing behind, like an empty editor tab.
    const discard = isNote(path) && dirname(path) === INBOX && state?.doc.toString().trim() === '';
    if (discard) await this.fs.remove(path);
    await this.detach(path);
    if (discard) await this.refreshTree();
  }

  async trash(path: string) {
    await this.flush();
    await trashNote(this.fs, path);
    await this.detach(path);
    await this.refreshTree();
  }

  /** A note changed its path: its tab and its editing state follow it. */
  private async repath(path: string, target: string) {
    const state = this.states.get(path);
    if (state) {
      this.states.delete(path);
      this.states.set(target, state);
    }
    const onDisk = this.disk.get(path);
    if (onDisk !== undefined) {
      this.disk.delete(path);
      this.disk.set(target, onDisk);
    }
    const { tabs, active } = this.snapshot;
    this.set({ tabs: tabs.map((tab) => (tab === path ? target : tab)), active: active === path ? target : active });
    this.saveWorkspace();
    await this.refreshTree();
  }

  async move(path: string, folder: string) {
    if (dirname(path) === folder) return;
    await this.flush();
    await this.repath(path, await moveNote(this.fs, path, folder));
  }

  /** Moves a note into a folder that is created for it. Returns a message when the name cannot be used. */
  async moveToNewFolder(path: string, name: string): Promise<string | null> {
    try {
      await this.move(path, await createFolder(this.fs, name));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'The folder could not be created.';
    }
  }

  /** Gives a note a name. Returns a message when the name cannot be used. */
  async rename(path: string, name: string): Promise<string | null> {
    await this.flush();
    try {
      await this.repath(path, await renameNote(this.fs, path, name));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'The note could not be renamed.';
    }
  }

  /** Creates a folder; returns a message when the name cannot be used. */
  async newFolder(name: string): Promise<string | null> {
    try {
      await createFolder(this.fs, name);
    } catch (error) {
      return error instanceof Error ? error.message : 'The folder could not be created.';
    }
    await this.refreshTree();
    return null;
  }

  format(action: FormatAction) {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    formatCommands[action](view);
    view.focus();
  }

  setLink(url: string) {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    setLink(url)(view);
    view.focus();
  }

  setSource(source: boolean) {
    this.set({ source });
    this.editor?.setSourceMode(source);
    this.editor?.view.focus();
  }
}
