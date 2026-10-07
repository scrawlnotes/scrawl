//! What signing in to a cloud drive needs from the desktop: a one-time listener on this
//! computer that catches the browser's return, the token requests (which the identity provider
//! refuses from a web page), and the system's credential store for the long-lived key.
//!
//! None of it knows a provider: OneDrive and Google Drive use the same commands. The access
//! tokens themselves never come back through here; the web side asks for them and keeps them in
//! memory.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::percent_decode;

/// How long a sign-in in the browser may take before the listener gives up.
const SIGN_IN_TIME: Duration = Duration::from_secs(5 * 60);

/// Listeners opened by `oauth_listen`, by port, until `oauth_wait` takes them.
#[derive(Default)]
pub struct Listeners(Mutex<HashMap<u16, Vec<TcpListener>>>);

/// Opens a listener on a free port of this computer, on both of its loopback addresses (a
/// browser may try either for `localhost`), and returns the port.
#[tauri::command]
pub async fn oauth_listen(listeners: tauri::State<'_, Listeners>) -> Result<u16, String> {
    let first = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = first.local_addr().map_err(|e| e.to_string())?.port();
    let mut all = vec![first];
    if let Ok(second) = TcpListener::bind(("::1", port)).await {
        all.push(second);
    }
    listeners.0.lock().unwrap().insert(port, all);
    Ok(port)
}

/// The two pages the browser shows when it comes back: signed in, or not.
#[derive(Deserialize)]
pub struct Pages {
    done: String,
    failed: String,
}

/// Waits for the browser to come back to the listener on `port`, and returns the code it
/// brings. The `state` must be the one the sign-in was started with; anything else is refused.
/// The listener closes when this returns.
#[tauri::command]
pub async fn oauth_wait(
    listeners: tauri::State<'_, Listeners>,
    port: u16,
    state: String,
    pages: Pages,
) -> Result<String, String> {
    let taken = listeners.0.lock().unwrap().remove(&port);
    let all = taken.ok_or("No sign-in is waiting on that port")?;
    match tokio::time::timeout(SIGN_IN_TIME, catch_return(&all, &state, &pages)).await {
        Ok(outcome) => outcome,
        Err(_) => Err("timeout".into()),
    }
}

async fn catch_return(all: &[TcpListener], state: &str, pages: &Pages) -> Result<String, String> {
    loop {
        let mut stream = accept_any(all).await.map_err(|e| e.to_string())?;
        let Some(query) = read_query(&mut stream).await else {
            // A request for something else, such as the page's icon.
            let _ = respond(&mut stream, "404 Not Found", "").await;
            continue;
        };
        let values = parse_query(&query);
        let outcome = if let Some(error) = values.get("error") {
            Err(values.get("error_description").unwrap_or(error).clone())
        } else if values.get("state").map(String::as_str) != Some(state) {
            Err("The sign-in came back with a different state".into())
        } else if let Some(code) = values.get("code") {
            Ok(code.clone())
        } else {
            let _ = respond(&mut stream, "404 Not Found", "").await;
            continue;
        };
        let page = if outcome.is_ok() { &pages.done } else { &pages.failed };
        let _ = respond(&mut stream, "200 OK", &page_html(page)).await;
        return outcome;
    }
}

/// Accepts the next connection on whichever listener (one or two) gets one first.
async fn accept_any(all: &[TcpListener]) -> std::io::Result<TcpStream> {
    let accepted = match all {
        [one] => one.accept().await,
        [one, two, ..] => tokio::select! {
            accepted = one.accept() => accepted,
            accepted = two.accept() => accepted,
        },
        [] => return Err(std::io::ErrorKind::NotConnected.into()),
    };
    accepted.map(|(stream, _)| stream)
}

/// Reads the request line of a `GET /?…` and returns what follows the `?`; `None` for any
/// other request.
async fn read_query(stream: &mut TcpStream) -> Option<String> {
    let mut buffer = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    while !buffer.windows(4).any(|w| w == b"\r\n\r\n") && buffer.len() < 16 * 1024 {
        let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut chunk))
            .await
            .ok()?
            .ok()?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    let text = String::from_utf8_lossy(&buffer);
    let target = text.lines().next()?.strip_prefix("GET ")?.split(' ').next()?;
    let query = target.strip_prefix("/?")?;
    Some(query.to_string())
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            let value = percent_decode(&value.replace('+', " ")).ok()?;
            Some((key.to_string(), value))
        })
        .collect()
}

fn page_html(message: &str) -> String {
    let escaped = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Scrawl</title>\
         <body style=\"font: 15px system-ui, sans-serif; display: grid; place-items: center; \
         height: 90vh; margin: 0; color: #ddd; background: #1e1e1e\"><p>{escaped}</p></body>"
    )
}

async fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(body.as_bytes()).await?;
    stream.shutdown().await
}

/// The token addresses the app may post to. Nothing else: this command must not become a way
/// for a page to reach any address without the browser's rules.
const TOKEN_ADDRESSES: &[&str] = &[
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
];

#[derive(Serialize)]
pub struct TokenResponse {
    status: u16,
    body: String,
}

/// Posts a form to a token address and returns the answer as it is, whatever its status; the
/// web side reads the tokens or the error from it. Sent without an `Origin`, as a desktop app.
#[tauri::command]
pub async fn token_request(
    url: String,
    form: HashMap<String, String>,
) -> Result<TokenResponse, String> {
    if !TOKEN_ADDRESSES.contains(&url.as_str()) {
        return Err("Not a token address".into());
    }
    let response = reqwest::Client::new()
        .post(&url)
        .form(&form)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "offline".to_string()
            } else {
                e.to_string()
            }
        })?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(TokenResponse { status, body })
}

/// The service under which Scrawl's secrets sit in the system's credential store.
const SERVICE: &str = "Scrawl";

/// Windows keeps at most 2560 bytes in one credential, and a refresh token can be longer; a
/// secret is kept in parts, with their count under its own name.
const PART: usize = 2048;

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

fn part_name(name: &str, index: usize) -> String {
    format!("{name}#{index}")
}

fn read_count(name: &str) -> Result<Option<usize>, String> {
    match entry(name)?.get_password() {
        Ok(text) => Ok(text.parse().ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn delete(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// A secret from the credential store, or nothing if it is not there.
#[tauri::command]
pub async fn secret_get(name: String) -> Result<Option<String>, String> {
    let Some(count) = read_count(&name)? else {
        return Ok(None);
    };
    let mut bytes = Vec::new();
    for index in 1..=count {
        match entry(&part_name(&name, index))?.get_secret() {
            Ok(part) => bytes.extend(part),
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(String::from_utf8(bytes).ok())
}

#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    let before = read_count(&name)?.unwrap_or(0);
    let parts: Vec<&[u8]> = value.as_bytes().chunks(PART).collect();
    for (index, part) in parts.iter().enumerate() {
        entry(&part_name(&name, index + 1))?
            .set_secret(part)
            .map_err(|e| e.to_string())?;
    }
    entry(&name)?
        .set_password(&parts.len().to_string())
        .map_err(|e| e.to_string())?;
    for index in parts.len() + 1..=before {
        delete(&part_name(&name, index))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn secret_delete(name: String) -> Result<(), String> {
    let count = read_count(&name)?.unwrap_or(0);
    delete(&name)?;
    for index in 1..=count {
        delete(&part_name(&name, index))?;
    }
    Ok(())
}

/// The computer's name, the default name of this device in conflict copies.
#[tauri::command]
pub fn device_name() -> Option<String> {
    ["COMPUTERNAME", "HOSTNAME"]
        .iter()
        .find_map(|key| std::env::var(key).ok())
        .filter(|name| !name.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_values_are_decoded() {
        let values = parse_query("code=M.C5_BAY.2.U%2Babc&state=x%20y&session_state=1");
        assert_eq!(values["code"], "M.C5_BAY.2.U+abc");
        assert_eq!(values["state"], "x y");
    }

    #[tokio::test]
    async fn the_browser_return_brings_the_code() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let pages = Pages { done: "Done".into(), failed: "Failed".into() };
        let browser = tokio::spawn(async move {
            // First the icon, which is refused, then the return itself.
            for path in ["/favicon.ico", "/?code=abc&state=s1"] {
                let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
                let request = format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n");
                stream.write_all(request.as_bytes()).await.unwrap();
                let mut answer = String::new();
                stream.read_to_string(&mut answer).await.unwrap();
                if path.starts_with("/?") {
                    assert!(answer.starts_with("HTTP/1.1 200") && answer.contains("Done"));
                } else {
                    assert!(answer.starts_with("HTTP/1.1 404"));
                }
            }
        });
        let code = catch_return(&[listener], "s1", &pages).await;
        browser.await.unwrap();
        assert_eq!(code.unwrap(), "abc");
    }

    /// Uses the real credential store of this computer, with a name of its own that it removes.
    #[tokio::test]
    #[ignore = "writes to the system's credential store"]
    async fn a_long_secret_is_kept_in_parts() {
        let name = format!("test-{}", std::process::id());
        let long: String = (0..5000).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
        secret_set(name.clone(), long.clone()).await.unwrap();
        assert_eq!(secret_get(name.clone()).await.unwrap(), Some(long));
        secret_set(name.clone(), "short".into()).await.unwrap();
        assert_eq!(secret_get(name.clone()).await.unwrap(), Some("short".into()));
        assert_eq!(read_count(&part_name(&name, 2)).unwrap(), None);
        secret_delete(name.clone()).await.unwrap();
        assert_eq!(secret_get(name).await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_different_state_is_refused() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let pages = Pages { done: "Done".into(), failed: "Failed".into() };
        tokio::spawn(async move {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            stream
                .write_all(b"GET /?code=abc&state=other HTTP/1.1\r\n\r\n")
                .await
                .unwrap();
            let mut answer = String::new();
            stream.read_to_string(&mut answer).await.unwrap();
        });
        assert!(catch_return(&[listener], "s1", &pages).await.is_err());
    }
}
