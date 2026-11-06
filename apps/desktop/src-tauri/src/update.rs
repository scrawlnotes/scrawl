//! The app's own updates (`design/desktop-release.md`). When the app opens, when its window is
//! brought back and every half hour it looks on GitHub for a newer version and only tells the web
//! app, which asks the person. Nothing is downloaded until the person says Update; once it is,
//! Restart installs it and opens the new version. A downloaded update not restarted into goes in
//! when the window is closed to the tray, the new version opening hidden too
//! (`design/background.md` 6), or when the person quits the app. Not when the system closes it,
//! shutting down: an installer cut short there would leave no app.
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

/// The first look, a moment after the app opens so that it does not slow the start.
const FIRST: Duration = Duration::from_secs(3);
/// How often an app left open looks again. Short, because the wait does not count while the
/// computer sleeps: one that sleeps often still looks.
const EVERY: Duration = Duration::from_secs(30 * 60);
/// The window brought back looks again when the last look that came through is older than this.
const STALE_MS: u64 = 10 * 60 * 1000;

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
    /// A newer version is out; nothing is downloaded until the person says Update.
    Available { version: String },
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
    /// When a look last came through, in milliseconds since 1970.
    looked: u64,
}

impl Inner {
    /// Starts a look unless one is running, an update is being downloaded or is downloaded, or a
    /// newer version is already found and the person did not ask; then it says how things stand.
    fn begin(&mut self, asked: bool) -> Option<Status> {
        match self.status {
            Status::Checking | Status::Downloading { .. } | Status::Ready { .. } => Some(self.status.clone()),
            // shortcut: a version found is not looked past until the person asks or says Update,
            // which downloads the newest anyway; look again here if the window's version must stay current.
            Status::Available { .. } if !asked => Some(self.status.clone()),
            _ => {
                self.status = Status::Checking;
                None
            }
        }
    }

    /// Starts a download unless one is running or done; then it says how things stand.
    fn begin_download(&mut self) -> Option<Status> {
        match &self.status {
            Status::Checking | Status::Downloading { .. } | Status::Ready { .. } => Some(self.status.clone()),
            Status::Available { version } => {
                self.status = Status::Downloading { version: version.clone(), percent: None };
                None
            }
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

fn failed(error: Error) -> Status {
    Status::Failed {
        offline: matches!(error, Error::ReleaseNotFound | Error::Reqwest(_) | Error::Network(_)),
        reason: error.to_string(),
    }
}

async fn find<R: Runtime>(app: &AppHandle<R>) -> Result<Status, Error> {
    Ok(match app.updater()?.check().await? {
        Some(update) => Status::Available { version: update.version },
        None => Status::UpToDate { checked: now() },
    })
}

/// Looks for a newer version, downloading nothing, or says how things stand (`Inner::begin`).
async fn look(app: &AppHandle, asked: bool) -> Status {
    if let Some(status) = app.state::<Updates>().0.lock().unwrap().begin(asked) {
        return status;
    }
    let _ = app.emit("update", Status::Checking);
    let status = find(app).await.unwrap_or_else(failed);
    if !matches!(status, Status::Failed { .. }) {
        app.state::<Updates>().0.lock().unwrap().looked = now();
    }
    set(app, status.clone());
    status
}

/// The window is brought back: it looks again unless a look came through a little while ago.
pub fn look_if_stale(app: &AppHandle) {
    if cfg!(debug_assertions) || now().saturating_sub(app.state::<Updates>().0.lock().unwrap().looked) < STALE_MS {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        look(&app, false).await;
    });
}

/// Looks for the newest version again and downloads it, when the person says Update.
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

/// Looks a moment after the app opens and every half hour after that, in a built app only.
pub fn start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST).await;
        loop {
            look(&app, false).await;
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
    look(&app, true).await
}

/// Update, said by the person: the newest version is downloaded. Downloaded with the window
/// closed, it goes in.
#[tauri::command]
pub async fn update_download(app: AppHandle) -> Status {
    let begun = app.state::<Updates>().0.lock().unwrap().begin_download();
    if let Some(status) = begun {
        return status;
    }
    let started = app.state::<Updates>().0.lock().unwrap().status.clone();
    let _ = app.emit("update", started);
    let status = fetch(&app).await.unwrap_or_else(failed);
    set(&app, status.clone());
    if matches!(status, Status::Ready { .. }) {
        install_when_hidden(&app);
    }
    status
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
        assert_eq!(inner.begin(false), None);
        assert_eq!(inner.status, Status::Checking);
        assert_eq!(inner.begin(true), Some(Status::Checking));
        inner.status = Status::Downloading { version: "0.2.0".into(), percent: Some(40) };
        assert!(inner.begin(true).is_some());
        inner.status = Status::Ready { version: "0.2.0".into() };
        assert_eq!(inner.begin(true), Some(Status::Ready { version: "0.2.0".into() }));
        for status in [Status::UpToDate { checked: 1 }, Status::Failed { offline: true, reason: String::new() }] {
            inner.status = status;
            assert_eq!(inner.begin(false), None);
        }
    }

    #[test]
    fn a_version_found_is_looked_past_only_when_asked() {
        let mut inner = Inner { status: Status::Available { version: "0.2.0".into() }, ..Default::default() };
        assert_eq!(inner.begin(false), Some(Status::Available { version: "0.2.0".into() }));
        assert_eq!(inner.begin(true), None);
    }

    #[test]
    fn a_download_starts_once_and_names_the_version_found() {
        let mut inner = Inner { status: Status::Available { version: "0.2.0".into() }, ..Default::default() };
        assert_eq!(inner.begin_download(), None);
        assert_eq!(inner.status, Status::Downloading { version: "0.2.0".into(), percent: None });
        assert!(inner.begin_download().is_some());
        inner.status = Status::Failed { offline: true, reason: String::new() };
        assert_eq!(inner.begin_download(), None);
        assert_eq!(inner.status, Status::Checking);
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
