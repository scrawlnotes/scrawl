import { dirname, type VaultFs } from '../fs';
import { trashFolder, trashItem } from '../vault';
import type { AppPlan } from './types';

// A plan written in one go: its folders, then its files in their order, _app.json last. One that
// falls halfway is taken back, so that no half app is left. Undo puts the folder in the trash, or,
// for templates added to an app, takes away what was added and puts back what was changed.

/** What an install wrote, for it to be taken back. */
export interface Installed {
  folder: string;
  /** The folders it made, the app's own first when it is new. */
  dirs: string[];
  /** The files it wrote, each with what was there before, null for a new one. */
  files: { path: string; before: string | null }[];
}

const exists = async (fs: VaultFs, path: string) => (fs.stat ? (await fs.stat(path)) !== null : (await fs.list(dirname(path))).some((e) => e.path === path));

/** Writes the plan. Takes back what it wrote and throws again when a write fails. */
export async function installApp(fs: VaultFs, plan: AppPlan): Promise<Installed> {
  if (plan.blocked?.length) throw new Error(plan.blocked.join(' '));
  const done: Installed = { folder: plan.folder, dirs: [], files: [] };
  try {
    for (const dir of plan.dirs) {
      if (await exists(fs, dir)) continue;
      await fs.mkdir(dir);
      done.dirs.push(dir);
    }
    for (const file of plan.files) {
      await fs.writeText(file.path, file.text);
      done.files.push({ path: file.path, before: file.before });
    }
  } catch (error) {
    await takeBack(fs, done);
    throw error;
  }
  return done;
}

/** Takes back a write that fell: what was changed as it was, the rest removed. */
async function takeBack(fs: VaultFs, done: Installed) {
  for (const file of [...done.files].reverse()) {
    try {
      if (file.before === null) await fs.remove(file.path);
      else await fs.writeText(file.path, file.before);
    } catch {
      // What cannot be taken back stays; the rest is taken back still.
    }
  }
  for (const dir of [...done.dirs].reverse()) await fs.remove(dir).catch(() => undefined);
}

/**
 * Undoes an install: a new app's folder goes to the trash; on an app set up before, the folders
 * and files it added go to the trash, the files it changed are put back as they were, and the
 * files it added to a collection (its rules, the records it started with) are taken away.
 */
export async function undoApp(fs: VaultFs, done: Installed, now = new Date()): Promise<void> {
  if (done.dirs[0] === done.folder) return trashFolder(fs, done.folder, now);
  const inDir = (path: string) => done.dirs.some((d) => path.startsWith(`${d}/`));
  for (const file of [...done.files].reverse()) {
    if (file.before !== null) await fs.writeText(file.path, file.before);
    else if (inDir(file.path)) continue;
    else if (file.path.endsWith('.md') && dirname(file.path) === done.folder) await trashItem(fs, file.path, now);
    else if (file.path.endsWith('.board.json')) await trashItem(fs, file.path, now);
    else await fs.remove(file.path);
  }
  for (const dir of [...done.dirs].reverse()) await trashFolder(fs, dir, now);
}
