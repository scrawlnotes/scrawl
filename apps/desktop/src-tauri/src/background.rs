//! Running on with the window closed (design/background.md): the tray icon and its menu, the
//! window hidden instead of closed, Quit, and what the app keeps of it in `shell.json`.
//!
//! The web app gives the menu its words and says how sync stands. Until it has, there is no tray
//! icon, and closing the window closes the app: a window is never hidden with nothing there to
//! bring it back.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, CloseRequestApi, Emitter, Manager, Window, Wry};
use tauri_plugin_notification::NotificationExt;

/// How long Quit waits for the web app to write what was typed before the app closes anyway.
const QUIT_WAIT: Duration = Duration::from_secs(3);

/// What the app keeps of running in the background, in its config folder beside settings.json.
/// Not in settings.json: the web app writes that one whole with the fields it knows.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Shell {
    /// Closing the window hides it, and the app goes on in the tray.
    pub background: bool,
    /// The notification of the first close was shown.
    pub background_told: bool,
}

impl Default for Shell {
    fn default() -> Self {
        Shell { background: true, background_told: false }
    }
}

/// The words of the tray's menu and of the first close's notification, in the app's language.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Words {
    open: String,
    quit: String,
    told_title: String,
    told_body: String,
}

/// The tray icon and its menu: Open, how sync stands, a line, Quit.
struct Tray {
    icon: TrayIcon<Wry>,
    menu: Menu<Wry>,
    open: MenuItem<Wry>,
    status: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    /// Whether the line of sync is in the menu: not while nothing syncs.
    status_shown: bool,
    words: Words,
}

/// The app's running in the background: `shell.json` as read, the tray once it is there, and
/// whether Quit was asked.
#[derive(Default)]
pub struct Background {
    shell: Mutex<Shell>,
    tray: Mutex<Option<Tray>>,
    quitting: AtomicBool,
}

fn shell_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("shell.json"))
}

/// Reads `shell.json` as the app starts; a missing or unreadable one is the defaults.
pub fn load(app: &AppHandle) {
    let shell = shell_file(app)
        .ok()
        .and_then(|file| fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str::<Shell>(&text).ok())
        .unwrap_or_default();
    *app.state::<Background>().shell.lock().unwrap() = shell;
}

fn save(app: &AppHandle, shell: &Shell) -> Result<(), String> {
    let text = serde_json::to_string_pretty(shell).map_err(|e| e.to_string())?;
    crate::write_atomic(&shell_file(app)?, text.as_bytes())
}

/// Whether closing the window hides it: with Background on, a tray icon to bring it back, and
/// Quit not asked.
pub fn hides(background: bool, tray: bool, quitting: bool) -> bool {
    background && tray && !quitting
}

/// The window is to close: hidden instead, when the app goes on in the tray.
pub fn on_close(window: &Window, api: &CloseRequestApi) {
    let app = window.app_handle();
    let state = app.state::<Background>();
    let background = state.shell.lock().unwrap().background;
    let tray = state.tray.lock().unwrap().is_some();
    if hides(background, tray, state.quitting.load(Ordering::SeqCst)) {
        api.prevent_close();
        hide(window);
    }
}

fn hide(window: &Window) {
    let _ = window.hide();
    let app = window.app_handle();
    // On macOS the app is then in the menu bar only, not in the Dock.
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(false);
    tell_once(app);
}

/// The first time the window is closed, the system says once that Scrawl goes on in the tray.
fn tell_once(app: &AppHandle) {
    let state = app.state::<Background>();
    let mut shell = state.shell.lock().unwrap();
    if shell.background_told {
        return;
    }
    let words = match state.tray.lock().unwrap().as_ref() {
        Some(tray) => tray.words.clone(),
        None => return,
    };
    shell.background_told = true;
    let _ = save(app, &shell);
    let _ = app.notification().builder().title(&words.told_title).body(&words.told_body).show();
}

/// Brings the window back: shown, not minimized, in front.
pub fn show(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Quit from the tray: the web app writes what was typed and says `quit_now`; the app closes
/// then, or after a few seconds if it does not answer.
fn quit(app: &AppHandle) {
    let state = app.state::<Background>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        app.exit(0);
        return;
    }
    let _ = app.emit("quit", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_WAIT);
        app.exit(0);
    });
}

/// The size the tray icon was drawn at for a screen's scale on Windows: the smallest not
/// smaller than the tray's, which Windows makes 16 px at 100 percent; 32 above that.
pub fn tray_size(scale: f64) -> u32 {
    let wanted = 16.0 * scale;
    [16, 20, 24, 32].into_iter().find(|&size| f64::from(size) >= wanted - 0.01).unwrap_or(32)
}

/// The tray icon for the screen it starts on: on Windows the app's tile drawn at that size, on
/// macOS the template, which the menu bar colours.
fn tray_image(app: &AppHandle) -> tauri::Result<Image<'static>> {
    let scale = app.primary_monitor().ok().flatten().map_or(1.0, |monitor| monitor.scale_factor());
    let bytes: &[u8] = if cfg!(target_os = "macos") {
        if scale >= 1.5 {
            include_bytes!("../icons/tray/tray-template@2x.png")
        } else {
            include_bytes!("../icons/tray/tray-template.png")
        }
    } else {
        match tray_size(scale) {
            16 => include_bytes!("../icons/tray/tray-16.png"),
            20 => include_bytes!("../icons/tray/tray-20.png"),
            24 => include_bytes!("../icons/tray/tray-24.png"),
            _ => include_bytes!("../icons/tray/tray-32.png"),
        }
    };
    Image::from_bytes(bytes)
}

/// The tray's icon, from the web app once it has started, with the menu's words; again after
/// that, only the words change.
#[tauri::command]
pub fn tray_start(app: AppHandle, words: Words) -> Result<(), String> {
    let state = app.state::<Background>();
    let mut slot = state.tray.lock().unwrap();
    if let Some(tray) = slot.as_mut() {
        let _ = tray.open.set_text(&words.open);
        let _ = tray.quit.set_text(&words.quit);
        tray.words = words;
        return Ok(());
    }
    let open = MenuItem::with_id(&app, "tray-open", &words.open, true, None::<&str>).map_err(|e| e.to_string())?;
    let status = MenuItem::with_id(&app, "tray-status", "", false, None::<&str>).map_err(|e| e.to_string())?;
    let line = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let quit_item = MenuItem::with_id(&app, "tray-quit", &words.quit, true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(&app, &[&open, &line, &quit_item]).map_err(|e| e.to_string())?;
    let icon = TrayIconBuilder::with_id("scrawl")
        .icon(tray_image(&app).map_err(|e| e.to_string())?)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Scrawl")
        .menu(&menu)
        // On Windows a click opens the window and the right button the menu; on macOS a click
        // opens the menu, as every item of the menu bar does.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show(app),
            "tray-quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show(tray.app_handle());
            }
        })
        .build(&app)
        .map_err(|e| e.to_string())?;
    *slot = Some(Tray { icon, menu, open, status, quit: quit_item, status_shown: false, words });
    Ok(())
}

/// How sync stands, in one line under Open; nothing while nothing syncs.
#[tauri::command]
pub fn tray_status(app: AppHandle, text: String) -> Result<(), String> {
    let state = app.state::<Background>();
    let mut slot = state.tray.lock().unwrap();
    let Some(tray) = slot.as_mut() else {
        return Ok(());
    };
    if text.is_empty() {
        if tray.status_shown {
            tray.menu.remove(&tray.status).map_err(|e| e.to_string())?;
            tray.status_shown = false;
        }
        return tray.icon.set_tooltip(Some("Scrawl")).map_err(|e| e.to_string());
    }
    tray.status.set_text(&text).map_err(|e| e.to_string())?;
    if !tray.status_shown {
        tray.menu.insert(&tray.status, 1).map_err(|e| e.to_string())?;
        tray.status_shown = true;
    }
    tray.icon.set_tooltip(Some(format!("Scrawl · {text}"))).map_err(|e| e.to_string())
}

/// Whether closing the window leaves the app running in the tray.
#[tauri::command]
pub fn background_get(state: tauri::State<'_, Background>) -> bool {
    state.shell.lock().unwrap().background
}

#[tauri::command]
pub fn background_set(app: AppHandle, on: bool) -> Result<(), String> {
    let state = app.state::<Background>();
    let mut shell = state.shell.lock().unwrap();
    shell.background = on;
    save(&app, &shell)
}

/// What was typed is written: Quit closes the app now.
#[tauri::command]
pub fn quit_now(app: AppHandle) {
    app.state::<Background>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closing_hides_only_with_background_on_a_tray_and_no_quit() {
        assert!(hides(true, true, false));
        assert!(!hides(false, true, false));
        assert!(!hides(true, false, false));
        assert!(!hides(true, true, true));
    }

    #[test]
    fn a_missing_shell_file_runs_in_the_background() {
        let shell: Shell = serde_json::from_str("{}").unwrap();
        assert_eq!(shell, Shell { background: true, background_told: false });
        let off: Shell = serde_json::from_str(r#"{ "background": false, "backgroundTold": true }"#).unwrap();
        assert_eq!(off, Shell { background: false, background_told: true });
        assert_eq!(serde_json::to_value(&off).unwrap(), serde_json::json!({ "background": false, "backgroundTold": true }));
    }

    #[test]
    fn the_tray_icon_is_the_one_drawn_for_the_scale() {
        assert_eq!(tray_size(1.0), 16);
        assert_eq!(tray_size(1.25), 20);
        assert_eq!(tray_size(1.5), 24);
        assert_eq!(tray_size(1.75), 32);
        assert_eq!(tray_size(2.0), 32);
        assert_eq!(tray_size(3.0), 32);
    }

    #[test]
    fn every_tray_icon_is_a_png_of_its_size() {
        let sizes: [(&[u8], u32); 6] = [
            (include_bytes!("../icons/tray/tray-16.png"), 16),
            (include_bytes!("../icons/tray/tray-20.png"), 20),
            (include_bytes!("../icons/tray/tray-24.png"), 24),
            (include_bytes!("../icons/tray/tray-32.png"), 32),
            (include_bytes!("../icons/tray/tray-template.png"), 18),
            (include_bytes!("../icons/tray/tray-template@2x.png"), 36),
        ];
        for (bytes, size) in sizes {
            let image = Image::from_bytes(bytes).unwrap();
            assert_eq!((image.width(), image.height()), (size, size));
        }
    }
}
