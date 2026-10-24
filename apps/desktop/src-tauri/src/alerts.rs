use serde::Deserialize;
use tauri::{AppHandle, Emitter};

// A new message as the computer's own notification (design/chat.md, 6.2 and 11.4): the web app
// decides, from the live channel, and this shows it. On Windows it is a toast of Scrawl's own, its
// conversation its tag: the next message of the conversation takes its place, and reading the
// conversation, here or on another device, takes it away. On macOS and Linux it is the
// notification plugin's, which can do neither.

/// A conversation's notification, as the web app words it.
#[derive(Deserialize)]
pub struct Alert {
    title: String,
    body: String,
    /// "3 new messages", when more than this one is unread.
    more: Option<String>,
    /// The conversation and its server's short name: one notification for each.
    tag: String,
    group: String,
    /// The message's link, which a click opens; none for the test.
    href: String,
}

#[tauri::command]
pub fn chat_notify(app: AppHandle, alert: Alert) -> Result<(), String> {
    #[cfg(windows)]
    return toast::show(&app, &alert).map_err(|error| error.to_string());
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        let body = match &alert.more {
            Some(more) => format!("{}\n{more}", alert.body),
            None => alert.body.clone(),
        };
        let _ = (&alert.tag, &alert.group);
        app.notification().builder().title(&alert.title).body(body).extra("href", &alert.href).show().map_err(|error| error.to_string())
    }
}

/// A conversation read: its notification goes, on Windows.
#[tauri::command]
pub fn chat_unnotify(app: AppHandle, tag: String, group: String) {
    #[cfg(windows)]
    let _ = toast::remove(&app, &tag, &group);
    #[cfg(not(windows))]
    let _ = (app, tag, group);
}

/// A click on a notification of the plugin's, on macOS and Linux: the window comes back at the message.
pub fn listen(app: &AppHandle) {
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        let handle = app.clone();
        let _ = app.notification().on_action(move |action| {
            if action.action_id() != "tap" {
                return;
            }
            let href = action.notification().and_then(|notification| notification.extra().get("href")).and_then(|href| href.as_str()).unwrap_or_default();
            open(&handle, href);
        });
    }
    #[cfg(windows)]
    let _ = app;
}

/// The window back in front, and Chat at the message.
fn open(app: &AppHandle, href: &str) {
    crate::background::show(app);
    if !href.is_empty() {
        let _ = app.emit("chat-open", href.to_string());
    }
}

#[cfg(windows)]
mod toast {
    use super::{open, Alert};
    use std::path::Path;
    use tauri::AppHandle;
    use windows::core::{IInspectable, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    /// PowerShell's, which Windows shows a toast for while the app is not installed, as it is
    /// while it is written; the notification plugin does the same.
    const UNINSTALLED_ID: &str = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

    /// Whose toasts they are to Windows: the installed app's, as its Start menu shortcut says.
    fn app_id(app: &AppHandle) -> String {
        let built = tauri::utils::platform::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_path_buf)).is_some_and(|folder| {
            let target = Path::new("target");
            folder.ends_with(target.join("debug")) || folder.ends_with(target.join("release"))
        });
        if built {
            UNINSTALLED_ID.to_string()
        } else {
            app.config().identifier.clone()
        }
    }

    fn escape(text: &str) -> String {
        text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
    }

    pub fn show(app: &AppHandle, alert: &Alert) -> windows::core::Result<()> {
        let lines: String = [Some(&alert.title), Some(&alert.body), alert.more.as_ref()].into_iter().flatten().map(|line| format!("<text>{}</text>", escape(line))).collect();
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from(format!("<toast launch=\"{}\"><visual><binding template=\"ToastGeneric\">{lines}</binding></visual></toast>", escape(&alert.href))))?;
        let toast = ToastNotification::CreateToastNotification(&xml)?;
        toast.SetTag(&HSTRING::from(&alert.tag))?;
        toast.SetGroup(&HSTRING::from(&alert.group))?;
        // Windows tells of a click only while the toast is on screen, as it does of the plugin's.
        let handle = app.clone();
        let href = alert.href.clone();
        toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(move |_, _| {
            open(&handle, &href);
            Ok(())
        }))?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id(app)))?.Show(&toast)
    }

    pub fn remove(app: &AppHandle, tag: &str, group: &str) -> windows::core::Result<()> {
        ToastNotificationManager::History()?.RemoveGroupedTagWithId(&HSTRING::from(tag), &HSTRING::from(group), &HSTRING::from(app_id(app)))
    }
}
