//! The desktop shell: a window around the web app, plus file access to the vault folder,
//! opening attached files, reading the titles of web pages, and what signing in to a cloud
//! drive needs (`cloud`).
//!
//! The commands mirror the `VaultFs` interface of `packages/core`. Every path is relative to
//! the vault root that the user chose, and may not leave it.

use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

mod cloud;

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    /// When a file was last written, in milliseconds since 1970; sync reads a file again only
    /// when this or its size changed.
    #[serde(skip_serializing_if = "Option::is_none")]
    modified: Option<u64>,
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
        let is_dir = entry.file_type().map_err(message)?.is_dir();
        let metadata = if is_dir { None } else { entry.metadata().ok() };
        let path = if dir.is_empty() {
            name.clone()
        } else {
            format!("{dir}/{name}")
        };
        out.push(entry_of(name, path, is_dir, metadata.as_ref()));
    }
    Ok(out)
}

fn entry_of(name: String, path: String, is_dir: bool, metadata: Option<&fs::Metadata>) -> Entry {
    let modified = metadata
        .and_then(|m| m.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64);
    Entry {
        name,
        path,
        kind: if is_dir { "dir" } else { "file" },
        size: metadata.map(|m| m.len()),
        modified,
    }
}

/// A file's entry as `fs_list` gives it, or nothing when there is no file there.
#[tauri::command]
async fn fs_stat(root: String, path: String) -> Result<Option<Entry>, String> {
    match fs::metadata(resolve(&root, &path)?) {
        Ok(metadata) if metadata.is_file() => {
            let name = path.rsplit('/').next().unwrap_or_default().to_string();
            Ok(Some(entry_of(name, path, false, Some(&metadata))))
        }
        Ok(_) => Ok(None),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(message(error)),
    }
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

/// Undoes the percent-encoding that lets a path travel in a header, which must be ASCII.
fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3).ok_or("Broken escape in a path")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Missing header {name}"))?;
    percent_decode(value)
}

/// Writes a file sent as raw bytes, with the vault and the path in the `x-root` and `x-path`
/// headers. Raw, because a large attachment would not survive being sent as a JSON array.
#[tauri::command]
async fn fs_write_bytes(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Expected the file's bytes".into());
    };
    let root = header(&request, "x-root")?;
    let path = header(&request, "x-path")?;
    write_atomic(&resolve(&root, &path)?, data)
}

/// Writes one part of a large file, sent as raw bytes: the vault, the path and where the part
/// starts go in the `x-root`, `x-path` and `x-offset` headers. The first part starts the file,
/// each later one must continue exactly where the file ends.
#[tauri::command]
async fn fs_write_part(request: Request<'_>) -> Result<(), String> {
    use std::io::Write;
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Expected the part's bytes".into());
    };
    let root = header(&request, "x-root")?;
    let path = header(&request, "x-path")?;
    let offset: u64 = header(&request, "x-offset")?
        .parse()
        .map_err(|_| "Broken part offset".to_string())?;
    let target = resolve(&root, &path)?;
    let mut file = if offset == 0 {
        create_parent(&target)?;
        fs::File::create(&target).map_err(message)?
    } else {
        let file = fs::OpenOptions::new().append(true).open(&target).map_err(message)?;
        if file.metadata().map_err(message)?.len() != offset {
            return Err("A part arrived out of order".into());
        }
        file
    };
    file.write_all(data).map_err(message)
}

/// Opens a file in the vault with the program the system uses for its kind.
#[tauri::command]
async fn open_file(app: tauri::AppHandle, root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Shows a file of the vault selected in its folder, in the system's file manager.
#[tauri::command]
async fn reveal_file(app: tauri::AppHandle, root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(|e| e.to_string())
}

/// Opens a link of a note in the default browser, a mail address in the mail program, or a
/// phone number in what the system calls with.
/// The web view itself ignores links that would open a new window.
#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_openable(&url) {
        return Err("Only web and mail addresses and phone numbers can be opened.".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn is_openable(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    ["http://", "https://", "mailto:", "tel:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
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

/// Lets the web view show files of the notes folder straight from disk (images, without
/// reading them into the page first). Nothing outside the folder is allowed.
fn allow_vault(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    match &settings.vault {
        Some(vault) => app
            .asset_protocol_scope()
            .allow_directory(vault, true)
            .map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// A missing or unreadable settings file means nothing has been chosen yet.
#[tauri::command]
async fn settings_load(app: tauri::AppHandle) -> Result<Settings, String> {
    let text = fs::read_to_string(settings_file(&app)?).unwrap_or_default();
    let settings: Settings = serde_json::from_str(&text).unwrap_or_default();
    allow_vault(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
async fn settings_save(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    write_atomic(&settings_file(&app)?, text.as_bytes())?;
    allow_vault(&app, &settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(cloud::Listeners::default())
        .invoke_handler(tauri::generate_handler![
            fs_list,
            fs_read,
            fs_write_text,
            fs_write_bytes,
            fs_move,
            fs_remove,
            fs_mkdir,
            fs_stat,
            settings_load,
            settings_save,
            open_file,
            reveal_file,
            open_url,
            fs_write_part,
            cloud::oauth_listen,
            cloud::oauth_wait,
            cloud::token_request,
            cloud::secret_get,
            cloud::secret_set,
            cloud::secret_delete,
            cloud::device_name
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
    fn percent_decode_reads_what_encode_uri_component_wrote() {
        assert_eq!(
            percent_decode("_attachments%2FScope%20v3%20%C4%9F.pdf").unwrap(),
            "_attachments/Scope v3 ğ.pdf"
        );
        assert!(percent_decode("broken%2").is_err());
    }

    #[test]
    fn only_web_and_mail_addresses_and_phone_numbers_open() {
        assert!(is_openable("https://github.com/tauri-apps/tauri"));
        assert!(is_openable("HTTP://example.com"));
        assert!(is_openable("mailto:someone@example.com"));
        assert!(is_openable("tel:+493012345"));
        assert!(!is_openable("file:///C:/Windows/system32/calc.exe"));
        assert!(!is_openable("C:/Windows/notepad.exe"));
        assert!(!is_openable("javascript:alert(1)"));
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
