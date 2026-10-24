//! The app's own updates (`design/desktop-release.md`). A little after the app opens and every
//! few hours it looks on GitHub for a newer version, downloads it without a word and tells the
//! web app, which shows Restart in the status bar. Restart installs it and opens the new
//! version. With the window closed, the app running in the tray, it goes in by itself and the new
//! version opens hidden too (`design/background.md` 6); with the window open and Restart not
//! pressed, when the window is closed, or when the person quits the app. Not when the system closes
//! it, shutting down: an installer cut short there would leave no app.
//!
//! Only a built app looks by itself: while developing, nothing is looked for until Settings ›
//! About asks.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// How long an update going in with the window closed waits for the web app to write what was
/// typed, before it goes in anyway.
const HIDDEN_WAIT: Duration = Duration::from_secs(10);
use tauri_plugin_updater::{Error, Update, UpdaterExt};

/// The first look, a little after the app opens so that it does not slow the start.
const FIRST: Duration = Duration::from_secs(30);
/// How often an app left open looks again, after a failed look too.
const EVERY: Duration = Duration::from_secs(4 * 60 * 60);

/// How the updates stand, as the web app shows them (`desktopUpdate.ts`).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    /// Not looked yet.
    #[default]
    Idle,
    Checking,
    /// No newer version; when it was last looked for, in milliseconds since 1970.
    UpToDate { checked: u64 },
    /// The share that has come, when the size is known.
    Downloading { version: String, percent: Option<u8> },
    /// Downloaded and its signature checked; it goes in on Restart or when the app closes.
    Ready { version: String },
    /// `offline` when GitHub could not be reached, which the web app says in its own words;
    /// otherwise `reason` says what went wrong.
    Failed { offline: bool, reason: String },
}

/// The updates of this app: how they stand, and the update once it is downloaded.
#[derive(Default)]
pub struct Updates(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    status: Status,
    ready: Option<(Update, Vec<u8>)>,
    /// The update is going in with the window closed.
    installing: bool,
}

impl Inner {
    /// Starts a look unless one is running or an update is already downloaded; then it says
    /// how things stand instead.
    fn begin(&mut self) -> Option<Status> {
        match self.status {
            Status::Checking | Status::Downloading { .. } | Status::Ready { .. } => Some(self.status.clone()),
            _ => {
                self.status = Status::Checking;
                None
            }
        }
    }
}

/// What has come of a download, telling a new whole percent only when it changes.
#[derive(Default)]
struct Progress {
    received: u64,
    shown: Option<u8>,
}

impl Progress {
    fn add(&mut self, chunk: usize, total: Option<u64>) -> Option<u8> {
        self.received += chunk as u64;
        let total = total.filter(|&total| total > 0)?;
        let percent = (self.received.min(total) * 100 / total) as u8;
        if self.shown == Some(percent) {
            return None;
        }
        self.shown = Some(percent);
        Some(percent)
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_millis() as u64)
}

fn set<R: Runtime>(app: &AppHandle<R>, status: Status) {
    app.state::<Updates>().0.lock().unwrap().status = status.clone();
    let _ = app.emit("update", status);
}

/// Looks for a newer version and downloads it, or says how things stand if a look is running
/// or an update is downloaded. Downloaded with the window closed, it goes in.
async fn look(app: &AppHandle) -> Status {
    if let Some(status) = app.state::<Updates>().0.lock().unwrap().begin() {
        return status;
    }
    let _ = app.emit("update", Status::Checking);
    let status = fetch(app).await.unwrap_or_else(|error| Status::Failed {
        offline: matches!(error, Error::ReleaseNotFound | Error::Reqwest(_) | Error::Network(_)),
        reason: error.to_string(),
    });
    set(app, status.clone());
    if matches!(status, Status::Ready { .. }) {
        install_when_hidden(app);
    }
    status
}

async fn fetch<R: Runtime>(app: &AppHandle<R>) -> Result<Status, Error> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(Status::UpToDate { checked: now() });
    };
    let version = update.version.clone();
    set(app, Status::Downloading { version: version.clone(), percent: None });
    let mut progress = Progress::default();
    let bytes = update
        .download(
            |chunk, total| {
                if let Some(percent) = progress.add(chunk, total) {
                    set(app, Status::Downloading { version: version.clone(), percent: Some(percent) });
                }
            },
            || {},
        )
        .await?;
    app.state::<Updates>().0.lock().unwrap().ready = Some((update, bytes));
    Ok(Status::Ready { version })
}

/// Looks a little after the app opens and every few hours after that, in a built app only.
pub fn start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST).await;
        loop {
            look(&app).await;
            tokio::time::sleep(EVERY).await;
        }
    });
}

#[tauri::command]
pub fn update_state(updates: tauri::State<'_, Updates>) -> Status {
    updates.0.lock().unwrap().status.clone()
}

/// Check for updates, from Settings › About.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Status {
    look(&app).await
}

/// An update is downloaded and the window is not on screen, closed or not shown since a start at
/// login: it goes in now, and the new version opens hidden too. The web app writes what was typed
/// first, as for Restart (`install-update`, then `update_restart`); if it does not answer, the
/// update goes in a little later anyway.
pub fn install_when_hidden(app: &AppHandle) {
    let hidden = app.get_webview_window("main").is_some_and(|window| !window.is_visible().unwrap_or(true));
    {
        let updates = app.state::<Updates>();
        let mut inner = updates.0.lock().unwrap();
        if !hidden || inner.ready.is_none() || inner.installing {
            return;
        }
        inner.installing = true;
    }
    crate::background::mark_reopen_hidden(app, true);
    let _ = app.emit("install-update", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(HIDDEN_WAIT);
        let _ = install_now(&app);
    });
}

/// Installs the downloaded update and opens the new version. On Windows the installer takes over
/// and the app exits here; it opens the new version itself, with the arguments this one had.
fn install_now(app: &AppHandle) -> Result<(), String> {
    let ready = app.state::<Updates>().0.lock().unwrap().ready.take();
    let Some((update, bytes)) = ready else {
        return Err("No update is ready.".into());
    };
    if let Err(error) = update.install(&bytes) {
        crate::background::mark_reopen_hidden(app, false);
        app.state::<Updates>().0.lock().unwrap().installing = false;
        set(app, Status::Failed { offline: false, reason: error.to_string() });
        return Err(error.to_string());
    }
    app.restart()
}

/// Restart, or an update going in with the window closed: the web app has written what was being
/// typed first.
#[tauri::command]
pub fn update_restart(app: AppHandle) -> Result<(), String> {
    install_now(&app)
}

/// When the person closes the app with an update downloaded, the update goes in, and the app does
/// not open again; when the system closes it, it does not, and goes in later. On Windows the
/// installer takes over and the app exits here.
pub fn on_exit(app: &AppHandle) {
    if !crate::background::closing_by_person(app) {
        return;
    }
    let ready = app.state::<Updates>().0.lock().unwrap().ready.take();
    if let Some((update, bytes)) = ready {
        let _ = update.restart_after_install(false).install(&bytes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_look_does_not_start_while_one_runs_or_an_update_waits() {
        let mut inner = Inner::default();
        assert_eq!(inner.begin(), None);
        assert_eq!(inner.status, Status::Checking);
        assert_eq!(inner.begin(), Some(Status::Checking));
        inner.status = Status::Downloading { version: "0.2.0".into(), percent: Some(40) };
        assert!(inner.begin().is_some());
        inner.status = Status::Ready { version: "0.2.0".into() };
        assert_eq!(inner.begin(), Some(Status::Ready { version: "0.2.0".into() }));
        for status in [Status::UpToDate { checked: 1 }, Status::Failed { offline: true, reason: String::new() }] {
            inner.status = status;
            assert_eq!(inner.begin(), None);
        }
    }

    #[test]
    fn a_download_tells_each_whole_percent_once() {
        let mut progress = Progress::default();
        assert_eq!(progress.add(100, None), None);
        let mut progress = Progress::default();
        assert_eq!(progress.add(10, Some(1000)), Some(1));
        assert_eq!(progress.add(5, Some(1000)), None);
        assert_eq!(progress.add(485, Some(1000)), Some(50));
        assert_eq!(progress.add(600, Some(1000)), Some(100));
    }

    #[test]
    fn the_web_app_reads_the_state_by_name() {
        let ready = serde_json::to_value(Status::Ready { version: "0.2.0".into() }).unwrap();
        assert_eq!(ready, serde_json::json!({ "state": "ready", "version": "0.2.0" }));
        let checked = serde_json::to_value(Status::UpToDate { checked: 5 }).unwrap();
        assert_eq!(checked, serde_json::json!({ "state": "upToDate", "checked": 5 }));
    }
}
