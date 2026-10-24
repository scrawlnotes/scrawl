//! Watching the spaces' folders (design/background.md 4): what another program writes there, an
//! agent above all, is told to the web app, which syncs it as it does a save and, with the window
//! on screen, reads it again. One debouncer watches every folder; a new list replaces it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::notify::{Event, EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// How long a folder's changes are gathered before they are told: a program writing many files
/// at once is told once.
const GATHER: Duration = Duration::from_secs(1);

/// The folders watched while the app runs.
#[derive(Default)]
pub struct Watches(Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>);

/// What changed in one folder: the paths inside it, with `/`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Changed {
    pub folder: String,
    pub paths: Vec<String>,
}

/// A folder watched: as the web app names it, and as the system names what is in it.
struct Root {
    folder: String,
    path: PathBuf,
}

/// The folders that are there; one gone (a drive not plugged in) is left out.
fn roots(folders: Vec<String>) -> Vec<Root> {
    folders
        .into_iter()
        .filter_map(|folder| {
            let path = Path::new(&folder).canonicalize().ok()?;
            path.is_dir().then_some(Root { folder, path })
        })
        .collect()
}

/// Where a changed path is: its folder, and the path inside it with `/`; not the folder itself.
fn place<'a>(roots: &'a [Root], path: &Path) -> Option<(&'a str, String)> {
    roots.iter().find_map(|root| {
        let inside = path.strip_prefix(&root.path).ok()?;
        let parts: Vec<String> = inside.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect();
        (!parts.is_empty()).then(|| (root.folder.as_str(), parts.join("/")))
    })
}

/// A moment's changes by folder, each path once. A file looked at is not changed.
fn gather<'a>(roots: &[Root], events: impl IntoIterator<Item = &'a Event>) -> Vec<Changed> {
    let mut all: Vec<Changed> = Vec::new();
    for event in events {
        if matches!(event.kind, EventKind::Access(_)) {
            continue;
        }
        for path in &event.paths {
            let Some((folder, inside)) = place(roots, path) else {
                continue;
            };
            match all.iter_mut().find(|changed| changed.folder == folder) {
                Some(changed) if changed.paths.contains(&inside) => {}
                Some(changed) => changed.paths.push(inside),
                None => all.push(Changed { folder: folder.to_string(), paths: vec![inside] }),
            }
        }
    }
    all
}

/// Watches the folders, all that is in them too, and tells what changed. A folder that cannot
/// be watched is left out and the others still are.
fn start(folders: Vec<String>, tell: impl Fn(Vec<Changed>) + Send + 'static) -> notify_debouncer_full::notify::Result<Debouncer<RecommendedWatcher, RecommendedCache>> {
    let roots = roots(folders);
    let paths: Vec<PathBuf> = roots.iter().map(|root| root.path.clone()).collect();
    let mut debouncer = new_debouncer(GATHER, None, move |result: DebounceEventResult| {
        if let Ok(events) = result {
            let changed = gather(&roots, events.iter().map(|debounced| &debounced.event));
            if !changed.is_empty() {
                tell(changed);
            }
        }
    })?;
    for path in &paths {
        let _ = debouncer.watch(path, RecursiveMode::Recursive);
    }
    Ok(debouncer)
}

/// The folders to watch now, the personal space's and each other space's on this device; those
/// watched before and not named are let go. Each change comes as `folder-changed`.
#[tauri::command]
pub fn watch_folders(app: AppHandle, watches: State<'_, Watches>, folders: Vec<String>) -> Result<(), String> {
    let debouncer = start(folders, move |changed| {
        for each in changed {
            let _ = app.emit("folder-changed", each);
        }
    })
    .map_err(|e| e.to_string())?;
    *watches.0.lock().unwrap() = Some(debouncer);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_full::notify::event::{AccessKind, CreateKind, ModifyKind};
    use std::fs;
    use std::sync::mpsc;

    fn root(folder: &str) -> Root {
        Root { folder: folder.to_string(), path: PathBuf::from(folder) }
    }

    #[test]
    fn changes_are_told_by_folder_with_their_paths_inside_it() {
        let roots = [root("/notes"), root("/acme")];
        let events = [
            Event::new(EventKind::Create(CreateKind::File)).add_path(PathBuf::from("/notes/Inbox/a.md")),
            Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from("/notes/Inbox/a.md")),
            Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from("/acme/Roadmap.board.json")),
            Event::new(EventKind::Access(AccessKind::Any)).add_path(PathBuf::from("/notes/b.md")),
            Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from("/elsewhere/c.md")),
            Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from("/notes")),
        ];
        assert_eq!(
            gather(&roots, &events),
            vec![
                Changed { folder: "/notes".into(), paths: vec!["Inbox/a.md".into()] },
                Changed { folder: "/acme".into(), paths: vec!["Roadmap.board.json".into()] },
            ]
        );
    }

    #[test]
    fn a_file_written_in_a_watched_folder_is_told() {
        let dir = std::env::temp_dir().join(format!("scrawl-watch-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Inbox")).unwrap();
        let folder = dir.to_string_lossy().into_owned();
        let (sender, told) = mpsc::channel();
        let watching = start(vec![folder.clone(), dir.join("gone").to_string_lossy().into_owned()], move |changed| {
            let _ = sender.send(changed);
        })
        .unwrap();
        fs::write(dir.join("Inbox").join("a.md"), "written by an agent").unwrap();
        let changed = told.recv_timeout(Duration::from_secs(10)).expect("nothing told");
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].folder, folder);
        assert!(changed[0].paths.contains(&"Inbox/a.md".to_string()), "{:?}", changed[0].paths);
        drop(watching);
        let _ = fs::remove_dir_all(&dir);
    }
}
