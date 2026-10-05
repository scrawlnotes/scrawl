//! The desktop shell: a window around the web app, plus file access to the vault folder.
//!
//! The commands mirror the `VaultFs` interface of `packages/core`. Every path is relative to
//! the vault root that the user chose, and may not leave it.

use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::Manager;

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    kind: &'static str,
}

fn message(error: std::io::Error) -> String {
    error.to_string()
}

/// Joins a vault-relative path onto the root, refusing anything but plain names (`..`, drive
/// letters and absolute paths would reach outside the vault).
fn resolve(root: &str, path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(path);
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(format!("Path leaves the vault: {path}"));
    }
    Ok(Path::new(root).join(relative))
}

fn create_parent(target: &Path) -> Result<(), String> {
    match target.parent() {
        Some(parent) => fs::create_dir_all(parent).map_err(message),
        None => Ok(()),
    }
}

/// Writes through a temporary file so that a crash or a sync client reading the folder never
/// sees a half-written note.
fn write_atomic(target: &Path, data: &[u8]) -> Result<(), String> {
    create_parent(target)?;
    let name = target.file_name().unwrap_or_default().to_string_lossy();
    let temporary = target.with_file_name(format!(".{name}.tmp"));
    fs::write(&temporary, data).map_err(message)?;
    fs::rename(&temporary, target).map_err(message)
}

/// Entries directly inside `dir`. A missing directory lists as empty.
#[tauri::command]
async fn fs_list(root: String, dir: String) -> Result<Vec<Entry>, String> {
    let entries = match fs::read_dir(resolve(&root, &dir)?) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(message(error)),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(message)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = if entry.file_type().map_err(message)?.is_dir() {
            "dir"
        } else {
            "file"
        };
        let path = if dir.is_empty() {
            name.clone()
        } else {
            format!("{dir}/{name}")
        };
        out.push(Entry { name, path, kind });
    }
    Ok(out)
}

#[tauri::command]
async fn fs_read(root: String, path: String) -> Result<Response, String> {
    fs::read(resolve(&root, &path)?)
        .map(Response::new)
        .map_err(message)
}

#[tauri::command]
async fn fs_write_text(root: String, path: String, text: String) -> Result<(), String> {
    write_atomic(&resolve(&root, &path)?, text.as_bytes())
}

#[tauri::command]
async fn fs_write_bytes(root: String, path: String, data: Vec<u8>) -> Result<(), String> {
    write_atomic(&resolve(&root, &path)?, &data)
}

#[tauri::command]
async fn fs_move(root: String, from: String, to: String) -> Result<(), String> {
    let target = resolve(&root, &to)?;
    create_parent(&target)?;
    fs::rename(resolve(&root, &from)?, target).map_err(message)
}

#[tauri::command]
async fn fs_remove(root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(message)
    } else {
        fs::remove_file(target).map_err(message)
    }
}

#[tauri::command]
async fn fs_mkdir(root: String, path: String) -> Result<(), String> {
    fs::create_dir_all(resolve(&root, &path)?).map_err(message)
}

/// What the app remembers between runs. Kept in the app's own config folder, not in the vault.
#[derive(Default, Serialize, Deserialize)]
struct Settings {
    /// The folder the notes are in.
    vault: Option<String>,
}

fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// A missing or unreadable settings file means nothing has been chosen yet.
#[tauri::command]
async fn settings_load(app: tauri::AppHandle) -> Result<Settings, String> {
    let text = fs::read_to_string(settings_file(&app)?).unwrap_or_default();
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

#[tauri::command]
async fn settings_save(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    write_atomic(&settings_file(&app)?, text.as_bytes())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs_list,
            fs_read,
            fs_write_text,
            fs_write_bytes,
            fs_move,
            fs_remove,
            fs_mkdir,
            settings_load,
            settings_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running Scrawl");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_keeps_paths_inside_the_vault() {
        assert!(resolve("C:/vault", "Inbox/note.md").is_ok());
        assert!(resolve("C:/vault", "").is_ok());
        assert!(resolve("C:/vault", "../outside.md").is_err());
        assert!(resolve("C:/vault", "Inbox/../../outside.md").is_err());
        assert!(resolve("C:/vault", "/etc/passwd").is_err());
        assert!(resolve("C:/vault", "C:/Windows/system.ini").is_err());
    }

    #[test]
    fn write_then_list_read_move_and_remove() {
        let root = std::env::temp_dir().join(format!("scrawl-test-{}", std::process::id()));
        let root_str = root.to_string_lossy().into_owned();
        let _ = fs::remove_dir_all(&root);

        write_atomic(&resolve(&root_str, "Inbox/a.md").unwrap(), b"hello").unwrap();
        assert_eq!(fs::read(root.join("Inbox/a.md")).unwrap(), b"hello");
        // The temporary file does not stay behind.
        assert_eq!(fs::read_dir(root.join("Inbox")).unwrap().count(), 1);

        let target = resolve(&root_str, "Work/b.md").unwrap();
        create_parent(&target).unwrap();
        fs::rename(resolve(&root_str, "Inbox/a.md").unwrap(), &target).unwrap();
        assert_eq!(fs::read(root.join("Work/b.md")).unwrap(), b"hello");

        fs::remove_dir_all(&root).unwrap();
    }
}
