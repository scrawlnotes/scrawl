//! Running on with the window closed (design/background.md): the tray icon and its menu, the
//! window hidden instead of closed, Quit, starting without a window when the computer does, and
//! what the app keeps of it in `shell.json`.
//!
//! The web app gives the menu its words and says how sync stands. Until it has, there is no tray
//! icon, and closing the window closes the app: a window is never hidden with nothing there to
//! bring it back.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, CloseRequestApi, Emitter, Manager, Window, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

/// The argument Scrawl is started with when the computer starts it: no window, the tray only.
pub const BACKGROUND_ARG: &str = "--background";

/// How long Quit waits for the web app to write what was typed before the app closes anyway.
const QUIT_WAIT: Duration = Duration::from_secs(3);
/// How soon after an update was put in with the window closed the app must start again to open
/// hidden: a mark older than this is one whose install did not come through.
const REOPEN_HIDDEN_MS: u64 = 5 * 60 * 1000;

/// What the app keeps of running in the background, in its config folder beside settings.json.
/// Not in settings.json: the web app writes that one whole with the fields it knows.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Shell {
    /// Closing the window hides it, and the app goes on in the tray.
    pub background: bool,
    /// The notification of the first close was shown.
    pub background_told: bool,
    /// Opening at login was turned on once, as it comes. Turned off after that, it stays off.
    pub autostart_set: bool,
    /// When an update was put in with the window closed, in milliseconds since 1970, 0 for none:
    /// the version it brings starts hidden, as the one before was.
    pub start_hidden_at: u64,
}

impl Default for Shell {
    fn default() -> Self {
        Shell { background: true, background_told: false, autostart_set: false, start_hidden_at: 0 }
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

/// The app's running in the background: `shell.json` as read, the tray once it is there,
/// whether the window is kept hidden since a start without one, and whether the person is closing
/// the app (Quit, or the window closed with Background off), which the updates ask.
#[derive(Default)]
pub struct Background {
    shell: Mutex<Shell>,
    tray: Mutex<Option<Tray>>,
    hidden: AtomicBool,
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

/// Whether Scrawl was started without a window, by the computer as it started.
pub fn asks_hidden(args: &[String]) -> bool {
    args.iter().any(|arg| arg == BACKGROUND_ARG)
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |time| time.as_millis() as u64)
}

/// Whether an update put in at `at` with the window closed is this start: a moment ago.
pub fn reopening(at: u64, now: u64) -> bool {
    at > 0 && now >= at && now - at < REOPEN_HIDDEN_MS
}

/// Whether this start is the new version of an app updated with its window closed. The mark is
/// taken either way, so that it never hides a window opened later.
pub fn reopens_hidden(app: &AppHandle) -> bool {
    let state = app.state::<Background>();
    let mut shell = state.shell.lock().unwrap();
    if shell.start_hidden_at == 0 {
        return false;
    }
    let hidden = reopening(shell.start_hidden_at, now());
    shell.start_hidden_at = 0;
    let _ = save(app, &shell);
    hidden
}

/// An update goes in with the window closed: the version it brings opens hidden too; or it did
/// not go in, and nothing is to open hidden.
pub fn mark_reopen_hidden(app: &AppHandle, on: bool) {
    let state = app.state::<Background>();
    let mut shell = state.shell.lock().unwrap();
    shell.start_hidden_at = if on { now() } else { 0 };
    let _ = save(app, &shell);
}

/// Whether the person is closing the app: Quit in the tray, or the window closed while it does
/// not go on in the tray. Not so when the system closes it, shutting down or signing out.
pub fn closing_by_person(app: &AppHandle) -> bool {
    app.state::<Background>().quitting.load(Ordering::SeqCst)
}

/// The window stays hidden from the start: the page opens and syncs, and nothing shows it but
/// the tray, or Scrawl started again.
pub fn start_hidden(app: &AppHandle) {
    app.state::<Background>().hidden.store(true, Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(false);
}

/// Whether the window was started hidden and not shown since: the page's being drawn does not
/// show it then.
pub fn keeps_hidden(app: &AppHandle) -> bool {
    app.state::<Background>().hidden.load(Ordering::SeqCst)
}

/// Opening at login comes on by itself once, in a built app: at its first start, or the first
/// start of the version that brought it. Turned off after that, it is not turned on again.
pub fn autostart_once(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let state = app.state::<Background>();
    let mut shell = state.shell.lock().unwrap();
    if shell.autostart_set || app.autolaunch().enable().is_err() {
        return;
    }
    shell.autostart_set = true;
    let _ = save(app, &shell);
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
    } else {
        // The window closes, and the app with it: the person's own closing.
        state.quitting.store(true, Ordering::SeqCst);
    }
}

fn hide(window: &Window) {
    let _ = window.hide();
    let app = window.app_handle();
    // On macOS the app is then in the menu bar only, not in the Dock.
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(false);
    tell_once(app);
    // An update waiting for the window to close goes in now.
    crate::update::install_when_hidden(app);
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

/// Brings the window back: shown, not minimized, in front. An update about to go in while it was
/// hidden opens the new version with its window then.
pub fn show(app: &AppHandle) {
    app.state::<Background>().hidden.store(false, Ordering::SeqCst);
    if app.state::<Background>().shell.lock().unwrap().start_hidden_at != 0 {
        mark_reopen_hidden(app, false);
    }
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

/// Whether Scrawl starts in the background when the person signs in to the computer: as the
/// system has it, which may have turned it off too (Task Manager's Startup apps).
#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, on: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let done = if on { manager.enable() } else { manager.disable() };
    done.map_err(|e| e.to_string())
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
        assert_eq!(shell, Shell { background: true, background_told: false, autostart_set: false, start_hidden_at: 0 });
        // A file from the version before opening at login: it is turned on once.
        let off: Shell = serde_json::from_str(r#"{ "background": false, "backgroundTold": true }"#).unwrap();
        assert_eq!(off, Shell { background: false, background_told: true, autostart_set: false, start_hidden_at: 0 });
        assert_eq!(
            serde_json::to_value(&off).unwrap(),
            serde_json::json!({ "background": false, "backgroundTold": true, "autostartSet": false, "startHiddenAt": 0 })
        );
    }

    #[test]
    fn only_a_fresh_update_opens_hidden() {
        let at = 1_000_000_000;
        assert!(reopening(at, at + 20_000));
        assert!(!reopening(at, at + REOPEN_HIDDEN_MS));
        assert!(!reopening(0, at));
        // A clock set back since: not this start.
        assert!(!reopening(at, at - 1));
    }

    #[test]
    fn only_the_computer_starts_scrawl_without_a_window() {
        let args = |list: &[&str]| list.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
        assert!(asks_hidden(&args(&["scrawl.exe", "--background"])));
        assert!(!asks_hidden(&args(&["scrawl.exe"])));
        assert!(!asks_hidden(&args(&["scrawl.exe", "--backgrounds"])));
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
