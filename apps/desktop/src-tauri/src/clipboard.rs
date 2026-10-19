// Files copied in the system and pasted into a note. Files copied in Explorer go on the clipboard
// as their paths, which the web view does not hand to the page; the app reads them here. Only a
// file the clipboard holds at the time is read.

use tauri::ipc::Response;

/// The paths of the files on the clipboard: what Ctrl+C on them in Explorer put there.
#[tauri::command]
pub fn clipboard_files() -> Vec<String> {
    #[cfg(windows)]
    {
        clipboard_win::get_clipboard::<Vec<String>, _>(clipboard_win::formats::FileList).unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// A file on the clipboard, read whole; one that is not on it now is refused.
#[tauri::command]
pub async fn clipboard_file(path: String) -> Result<Response, String> {
    if !clipboard_files().contains(&path) {
        return Err("This file is not on the clipboard".into());
    }
    std::fs::read(&path).map(Response::new).map_err(|error| error.to_string())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn reads_only_the_files_on_the_clipboard() {
        let dir = std::env::temp_dir().join("scrawl-clipboard-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("pasted.txt");
        std::fs::write(&file, "pasted").unwrap();
        let path = file.to_string_lossy().to_string();
        {
            use clipboard_win::Setter;
            let _open = clipboard_win::Clipboard::new_attempts(10).unwrap();
            clipboard_win::raw::empty().unwrap();
            clipboard_win::formats::FileList.write_clipboard(&[path.as_str()]).unwrap();
        }
        assert_eq!(clipboard_files(), vec![path.clone()]);
        assert!(tauri::async_runtime::block_on(clipboard_file(path)).is_ok());
        let other = dir.join("not-copied.txt").to_string_lossy().to_string();
        assert!(tauri::async_runtime::block_on(clipboard_file(other)).is_err());
    }
}
