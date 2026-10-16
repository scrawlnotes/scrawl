//! The desktop shell: a window around the web app, plus file access to the vault folder,
//! opening attached files, reading the titles of web pages, and what signing in to a cloud
//! drive needs (`cloud`), and the app's own updates (`update`).
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
mod update;

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

/// A space beside the personal one: its id, the folder of its copy on this device, and what the
/// web app keeps beside them (its name, where it lives in the cloud), passed through as it is.
#[derive(Clone, Serialize, Deserialize)]
struct SpaceEntry {
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    folder: Option<String>,
    #[serde(flatten)]
    rest: serde_json::Map<String, serde_json::Value>,
}

/// What the app remembers between runs. Kept in the app's own config folder, not in the vault.
#[derive(Default, Serialize, Deserialize)]
struct Settings {
    /// The folder the notes are in.
    vault: Option<String>,
    /// The other spaces, in the order the sidebar shows them.
    #[serde(default)]
    spaces: Vec<SpaceEntry>,
}

fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// Lets the web view show files of the notes folder straight from disk (images, without
/// reading them into the page first). Nothing outside the folder is allowed.
fn allow_vault(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for folder in settings.vault.iter().chain(settings.spaces.iter().filter_map(|s| s.folder.as_ref())) {
        scope.allow_directory(folder, true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A folder's name made of a space's name: letters, digits, spaces, `-` and `_`, and never one
/// of the names Windows keeps for devices.
fn space_folder_name(name: &str) -> Option<String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let clean = clean.trim().to_string();
    if clean.is_empty() {
        return None;
    }
    let upper = clean.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || ((upper.starts_with("COM") || upper.starts_with("LPT")) && upper.len() == 4 && upper.as_bytes()[3].is_ascii_digit());
    Some(if reserved { format!("{clean} space") } else { clean })
}

/// A folder of its own for a new space, named after it in the app's data folder; a name already
/// taken there gets a number.
#[tauri::command]
async fn space_folder_new(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let clean = space_folder_name(&name).ok_or("A space needs a name")?;
    let mut dir = base.join(&clean);
    let mut n = 2;
    while dir.exists() {
        dir = base.join(format!("{clean} {n}"));
        n += 1;
    }
    fs::create_dir_all(&dir).map_err(message)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// The id a folder's `.scrawl/space.json` gives it, if it has one.
fn space_id_in(folder: &Path) -> Option<String> {
    let text = fs::read_to_string(folder.join(".scrawl").join("space.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("id")?.as_str().map(str::to_owned)
}

/// Whether a folder is the copy of space `id` that the app made: right inside the app's data
/// folder, or moved by the app into a folder chosen for it, and so holding that space's id. Never
/// the personal space's folder, nor one around it.
fn space_copy_folder(folder: &Path, data: &Path, vault: Option<&str>, id: &str) -> bool {
    let (Ok(folder), Ok(data)) = (folder.canonicalize(), data.canonicalize()) else {
        return false;
    };
    let inside = folder.parent().is_some_and(|parent| parent == data);
    let around_personal = vault.and_then(|vault| Path::new(vault).canonicalize().ok()).is_some_and(|vault| vault.starts_with(&folder));
    (inside || space_id_in(&folder).as_deref() == Some(id)) && !around_personal
}

/// Deletes the copy of a space on this device with everything in it: only a folder the settings
/// list as a space and the app made for it, never another folder of the computer.
#[tauri::command]
async fn space_folder_delete(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    let text = fs::read_to_string(settings_file(&app)?).unwrap_or_default();
    let settings: Settings = serde_json::from_str(&text).unwrap_or_default();
    let Some(space) = settings.spaces.iter().find(|s| s.folder.as_deref() == Some(folder.as_str())) else {
        return Err("Not a space of this device".into());
    };
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = Path::new(&folder);
    if !path.is_dir() {
        return Ok(());
    }
    if !space_copy_folder(path, &data, settings.vault.as_deref(), &space.id) {
        return Err("Only a space's copy that Scrawl made can be deleted".into());
    }
    fs::remove_dir_all(path).map_err(message)
}

fn copy_folder(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(message)?;
    for entry in fs::read_dir(from).map_err(message)? {
        let entry = entry.map_err(message)?;
        let target = to.join(entry.file_name());
        if entry.file_type().map_err(message)?.is_dir() {
            copy_folder(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err(message)?;
        }
    }
    Ok(())
}

/// Moves a folder whole into an empty one, or to where none is yet: renamed on the same drive,
/// copied and then deleted across drives. A copy that fails halfway is taken back, the chosen
/// folder left empty as it was.
fn move_folder(from: &Path, to: &Path) -> Result<(), String> {
    if !from.is_dir() {
        return Err("The space's folder is not there".into());
    }
    let (Ok(source), Some(parent)) = (from.canonicalize(), to.parent()) else {
        return Err("The space's folder is not there".into());
    };
    let target = parent.canonicalize().map_err(message)?.join(to.file_name().ok_or("Choose a folder")?);
    if target.starts_with(&source) || source.starts_with(&target) {
        return Err("A space's folder cannot move into itself".into());
    }
    if to.exists() {
        if fs::read_dir(to).map_err(message)?.next().is_some() {
            return Err("Choose an empty folder".into());
        }
        fs::remove_dir(to).map_err(message)?;
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    if let Err(error) = copy_folder(from, to) {
        let _ = fs::remove_dir_all(to);
        let _ = fs::create_dir_all(to);
        return Err(error);
    }
    fs::remove_dir_all(from).map_err(message)
}

/// Moves the copy of space `id` on this device into a folder chosen for it, which is empty: what
/// the settings list as its folder, and nothing else. The settings are saved by the app after.
#[tauri::command]
async fn space_folder_move(app: tauri::AppHandle, id: String, to: String) -> Result<(), String> {
    let text = fs::read_to_string(settings_file(&app)?).unwrap_or_default();
    let settings: Settings = serde_json::from_str(&text).unwrap_or_default();
    let from = settings.spaces.iter().find(|s| s.id == id).and_then(|s| s.folder.clone()).ok_or("Not a space of this device")?;
    move_folder(Path::new(&from), Path::new(&to))
}

/// Whether a folder is there: a space whose folder is gone is skipped, not made again.
#[tauri::command]
async fn folder_exists(folder: String) -> bool {
    Path::new(&folder).is_dir()
}

/// Where the notes go unless another folder is chosen: `Personal` in the app's own data folder
/// (`AppDataRoaming` on Windows, `Library/Application Support` on macOS, `.local/share` on Linux).
fn default_vault(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("Personal"))
}

#[tauri::command]
async fn default_vault_folder(app: tauri::AppHandle) -> Result<String, String> {
    Ok(default_vault(&app)?.to_string_lossy().into_owned())
}

/// A missing or unreadable settings file, or one without a folder, means the default folder: it
/// is made and remembered, so that nothing is asked at the first start.
#[tauri::command]
async fn settings_load(app: tauri::AppHandle) -> Result<Settings, String> {
    let text = fs::read_to_string(settings_file(&app)?).unwrap_or_default();
    let mut settings: Settings = serde_json::from_str(&text).unwrap_or_default();
    if settings.vault.is_none() {
        let dir = default_vault(&app)?;
        fs::create_dir_all(&dir).map_err(message)?;
        settings.vault = Some(dir.to_string_lossy().into_owned());
        let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        write_atomic(&settings_file(&app)?, text.as_bytes())?;
    }
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(cloud::Listeners::default())
        .manage(update::Updates::default())
        .setup(|app| {
            update::start(app.handle());
            Ok(())
        })
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
            default_vault_folder,
            space_folder_new,
            space_folder_delete,
            space_folder_move,
            folder_exists,
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
            cloud::device_name,
            update::update_state,
            update::update_check,
            update::update_restart
        ])
        .build(tauri::generate_context!())
        .expect("error while running Scrawl")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                update::on_exit(app);
            }
        });
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
    fn a_space_folder_is_named_after_the_space_and_never_a_device() {
        assert_eq!(space_folder_name(" Acme / Sales ").as_deref(), Some("Acme - Sales"));
        assert_eq!(space_folder_name("con").as_deref(), Some("con space"));
        assert_eq!(space_folder_name("COM3").as_deref(), Some("COM3 space"));
        assert_eq!(space_folder_name("Comet").as_deref(), Some("Comet"));
        assert_eq!(space_folder_name("  "), None);
    }

    #[test]
    fn only_a_space_copy_the_app_made_is_deleted() {
        let data = std::env::temp_dir().join(format!("scrawl-space-test-{}", std::process::id()));
        let copy = data.join("Acme");
        let personal = data.join("Personal");
        let elsewhere = data.join("Clients").join("Northwind");
        let moved = data.join("Clients").join("Globex");
        for dir in [&copy, &personal, &elsewhere, &moved.join(".scrawl")] {
            fs::create_dir_all(dir).unwrap();
        }
        fs::write(moved.join(".scrawl").join("space.json"), r#"{"id":"sp-k7f3m2qa","name":"Globex"}"#).unwrap();
        let vault = personal.to_string_lossy().into_owned();
        assert!(space_copy_folder(&copy, &data, Some(&vault), "sp-aaaaaaaa"));
        assert!(!space_copy_folder(&personal, &data, Some(&vault), "sp-aaaaaaaa"));
        assert!(!space_copy_folder(&elsewhere, &data, Some(&vault), "sp-aaaaaaaa"));
        assert!(!space_copy_folder(&data, &data, Some(&vault), "sp-aaaaaaaa"));
        // Moved by the app out of its data folder: it holds the space's id.
        assert!(space_copy_folder(&moved, &data, Some(&vault), "sp-k7f3m2qa"));
        assert!(!space_copy_folder(&moved, &data, Some(&vault), "sp-aaaaaaaa"));
        fs::remove_dir_all(&data).unwrap();
    }

    #[test]
    fn a_space_copy_moves_whole_into_an_empty_folder() {
        let base = std::env::temp_dir().join(format!("scrawl-space-move-{}", std::process::id()));
        let from = base.join("Acme");
        fs::create_dir_all(from.join("Sales")).unwrap();
        fs::write(from.join("Sales").join("Plan.md"), "# Plan").unwrap();
        let full = base.join("Full");
        fs::create_dir_all(&full).unwrap();
        fs::write(full.join("keep.txt"), "mine").unwrap();
        assert!(move_folder(&from, &full).is_err());
        assert!(move_folder(&from, &from.join("Sales")).is_err());
        assert!(full.join("keep.txt").is_file());
        let empty = base.join("Elsewhere");
        fs::create_dir_all(&empty).unwrap();
        move_folder(&from, &empty).unwrap();
        assert!(!from.exists());
        assert_eq!(fs::read_to_string(empty.join("Sales").join("Plan.md")).unwrap(), "# Plan");
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_space_keeps_what_the_web_app_wrote_beside_it() {
        let text = r#"{"vault":"C:/v","spaces":[{"id":"sp-k7f3m2qa","folder":"C:/d/Acme","name":"Acme","source":{"provider":"onedrive","place":{"item":"i1"}}}]}"#;
        let settings: Settings = serde_json::from_str(text).unwrap();
        let back: serde_json::Value = serde_json::to_value(&settings).unwrap();
        assert_eq!(back["spaces"][0]["name"], "Acme");
        assert_eq!(back["spaces"][0]["source"]["place"]["item"], "i1");
        assert_eq!(back["spaces"][0]["folder"], "C:/d/Acme");
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
