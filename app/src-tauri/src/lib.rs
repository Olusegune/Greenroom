//! Greenroom, Slice 0: keys in the Windows Credential Manager and a listening lab that asks cloud providers for short
//! test clips. Keys never leave this file: the UI can set, clear and ask whether one exists, never read one back.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Read;
use std::time::{Duration, Instant};
use tauri::Manager;

const SERVICE: &str = "Greenroom";
const ELEVEN: &str = "https://api.elevenlabs.io";
const KIE: &str = "https://api.kie.ai";
const MAX_AUDIO: u64 = 25 << 20;

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !matches!(name, "elevenlabs" | "kie") {
        return Err("Unknown provider.".into());
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| format!("Could not reach the Windows Credential Manager: {e}"))
}

fn get_key(name: &str) -> Result<String, String> {
    match entry(name)?.get_password() {
        Ok(k) if !k.trim().is_empty() => Ok(k.trim().to_string()),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(format!("Add your {} key in Settings first.", label(name))),
        Err(e) => Err(format!("Could not read the Windows Credential Manager: {e}")),
    }
}

fn label(name: &str) -> &'static str {
    if name == "kie" {
        "Kie"
    } else {
        "ElevenLabs"
    }
}

#[derive(Serialize)]
struct KeyStatus {
    elevenlabs: bool,
    kie: bool,
}

#[tauri::command]
fn key_status() -> KeyStatus {
    let has = |n: &str| entry(n).ok().and_then(|e| e.get_password().ok()).map(|k| !k.trim().is_empty()).unwrap_or(false);
    KeyStatus { elevenlabs: has("elevenlabs"), kie: has("kie") }
}

#[tauri::command]
fn set_key(name: String, value: String) -> Result<(), String> {
    let v = value.trim();
    if v.is_empty() || v.len() > 512 || !v.bytes().all(|b| b.is_ascii_graphic()) {
        return Err("That does not look like an API key. Paste it again without spaces.".into());
    }
    entry(&name)?.set_password(v).map_err(|e| format!("Could not save to the Windows Credential Manager: {e}"))
}

#[tauri::command]
fn clear_key(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove the key: {e}")),
    }
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_write(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(90))
        .build()
}

fn read_all(r: ureq::Response, max: u64) -> Result<Vec<u8>, String> {
    let mut v = Vec::new();
    r.into_reader().take(max).read_to_end(&mut v).map_err(|_| "The download was interrupted.".to_string())?;
    Ok(v)
}

fn short(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(180).collect()
}

fn http_error(who: &str, code: u16, r: ureq::Response) -> String {
    let body = r.into_string().unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v["detail"]["message"].as_str().or(v["detail"].as_str()).or(v["msg"].as_str()).map(short))
        .unwrap_or_default();
    let base = match code {
        401 | 403 => format!("{who} did not accept the key. Check it in Settings."),
        402 => format!("{who} says the account is out of credit or plan allowance."),
        429 => format!("{who} is busy or rate-limiting. Wait a minute and try again."),
        c => format!("{who} returned an error ({c})."),
    };
    if detail.is_empty() {
        base
    } else {
        format!("{base} {detail}")
    }
}

fn eleven_get(path: &str) -> Result<Value, String> {
    let key = get_key("elevenlabs")?;
    match agent().get(&format!("{ELEVEN}{path}")).set("xi-api-key", &key).call() {
        Ok(r) => serde_json::from_slice(&read_all(r, 4 << 20)?).map_err(|_| "ElevenLabs sent something unexpected.".to_string()),
        Err(ureq::Error::Status(c, r)) => Err(http_error("ElevenLabs", c, r)),
        Err(ureq::Error::Transport(_)) => Err("Could not reach ElevenLabs. Check your internet connection.".into()),
    }
}

fn eleven_post(path: &str, body: &Value) -> Result<Vec<u8>, String> {
    let key = get_key("elevenlabs")?;
    match agent().post(&format!("{ELEVEN}{path}")).set("xi-api-key", &key).set("content-type", "application/json").send_string(&body.to_string()) {
        Ok(r) => read_all(r, MAX_AUDIO),
        Err(ureq::Error::Status(c, r)) => Err(http_error("ElevenLabs", c, r)),
        Err(ureq::Error::Transport(_)) => Err("Could not reach ElevenLabs. Check your internet connection.".into()),
    }
}

#[derive(Serialize)]
struct Voice {
    id: String,
    name: String,
}

#[tauri::command]
async fn eleven_voices() -> Result<Vec<Voice>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let v = eleven_get("/v1/voices")?;
        let list = v["voices"].as_array().ok_or("ElevenLabs returned no voices.")?;
        Ok(list
            .iter()
            .filter_map(|x| Some(Voice { id: x["voice_id"].as_str()?.to_string(), name: short(x["name"].as_str().unwrap_or("Voice")) }))
            .take(30)
            .collect())
    })
    .await
    .map_err(|_| "The request was interrupted.".to_string())?
}

/// Kie wraps every answer in `{code, msg, data}` and may use HTTP 200 for errors, so `code` is what counts.
fn kie_call(method: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
    let key = get_key("kie")?;
    let req = agent().request(method, &format!("{KIE}{path}")).set("Authorization", &format!("Bearer {key}"));
    let res = match body {
        Some(b) => req.set("content-type", "application/json").send_string(&b.to_string()),
        None => req.call(),
    };
    let v: Value = match res {
        Ok(r) => serde_json::from_slice(&read_all(r, 4 << 20)?).map_err(|_| "Kie sent something unexpected.".to_string())?,
        Err(ureq::Error::Status(c, r)) => return Err(http_error("Kie", c, r)),
        Err(ureq::Error::Transport(_)) => return Err("Could not reach Kie. Check your internet connection.".into()),
    };
    match v["code"].as_i64() {
        Some(200) => Ok(v),
        Some(401) | Some(403) => Err("Kie did not accept the key. Check it in Settings.".into()),
        Some(402) => Err("Kie says the account is out of credits.".into()),
        Some(429) => Err("Kie is busy. Wait a minute and try again.".into()),
        Some(c) => Err(format!("Kie reported code {c}. {}", short(v["msg"].as_str().unwrap_or("")))),
        None => Err("Kie sent something unexpected.".into()),
    }
}

fn urls(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) if s.starts_with("https://") => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| urls(x, out)),
        Value::Object(o) => o.values().for_each(|x| urls(x, out)),
        _ => {}
    }
}

fn kie_run(model: &str, input: Value) -> Result<Vec<u8>, String> {
    let created = kie_call("POST", "/api/v1/jobs/createTask", Some(&json!({ "model": model, "input": input })))?;
    let task = created["data"]["taskId"]
        .as_str()
        .filter(|t| !t.is_empty() && t.len() <= 100 && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
        .ok_or("Kie did not accept the job. The model name may have changed.")?
        .to_string();
    for _ in 0..60 {
        std::thread::sleep(Duration::from_secs(3));
        let v = kie_call("GET", &format!("/api/v1/jobs/recordInfo?taskId={task}"), None)?;
        let d = &v["data"];
        match d["state"].as_str().unwrap_or("") {
            "success" => {
                let mut found = Vec::new();
                if let Some(parsed) = d["resultJson"].as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()) {
                    urls(&parsed, &mut found);
                }
                urls(&d["response"], &mut found);
                let url = found.into_iter().next().ok_or("Kie finished but returned no audio file.")?;
                return match agent().get(&url).call() {
                    Ok(r) => read_all(r, MAX_AUDIO),
                    Err(_) => Err("Could not download the clip from Kie.".into()),
                };
            }
            "fail" => return Err(format!("Kie could not make this clip. {}", short(d["failMsg"].as_str().unwrap_or("")))),
            _ => {}
        }
    }
    Err("Kie took too long. The clip may still appear in your Kie account.".into())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipReq {
    provider: String,
    text: String,
    voice: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipOut {
    audio_b64: String,
    mime: String,
    ms: u128,
}

fn mime_of(b: &[u8]) -> &'static str {
    if b.starts_with(b"RIFF") {
        "audio/wav"
    } else if b.starts_with(b"OggS") {
        "audio/ogg"
    } else {
        "audio/mpeg"
    }
}

fn make_clip(req: ClipReq) -> Result<Vec<u8>, String> {
    let text = req.text.trim();
    if text.is_empty() || text.len() > 2000 {
        return Err("The test line is empty or too long.".into());
    }
    match req.provider.as_str() {
        p @ ("eleven-tts" | "eleven-v4") => {
            let voice = req
                .voice
                .filter(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_alphanumeric()))
                .ok_or("Pick an ElevenLabs voice first.")?;
            let model = if p == "eleven-v4" { "eleven_v4" } else { "eleven_v3" };
            eleven_post(&format!("/v1/text-to-speech/{voice}?output_format=mp3_44100_128"), &json!({ "text": text, "model_id": model }))
        }
        "eleven-sfx" => eleven_post("/v1/sound-generation?output_format=mp3_44100_128", &json!({ "text": text, "duration_seconds": 3.0 })),
        "kie-tts" => kie_run("elevenlabs/text-to-speech-turbo-2-5", json!({ "text": text })),
        "kie-dialogue" => kie_run("elevenlabs/text-to-dialogue-v3", json!({ "dialogue": [{ "text": text, "voice": "EkK5I93UQWFDigLMpZcX" }] })),
        "kie-sfx" => kie_run("elevenlabs/sound-effect-v2", json!({ "text": text })),
        _ => Err("Unknown test type.".into()),
    }
}

#[tauri::command]
async fn run_clip(req: ClipReq) -> Result<ClipOut, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let t = Instant::now();
        let bytes = make_clip(req)?;
        if bytes.len() < 200 {
            return Err("The provider returned an empty clip.".to_string());
        }
        Ok(ClipOut { mime: mime_of(&bytes).into(), audio_b64: base64::engine::general_purpose::STANDARD.encode(&bytes), ms: t.elapsed().as_millis() })
    })
    .await
    .map_err(|_| "The request was interrupted.".to_string())?
}

/// Saves the owner's ratings as a Markdown report in Documents\Greenroom and returns its path.
#[tauri::command]
fn save_report(app: tauri::AppHandle, text: String) -> Result<String, String> {
    if text.len() > 200_000 {
        return Err("The report is too large.".into());
    }
    let dir = app.path().document_dir().map_err(|_| "Could not find your Documents folder.".to_string())?.join("Greenroom");
    std::fs::create_dir_all(&dir).map_err(|_| "Could not create the Greenroom folder in Documents.".to_string())?;
    let file = dir.join("listening-report.md");
    std::fs::write(&file, text).map_err(|_| "Could not write the report.".to_string())?;
    Ok(file.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![key_status, set_key, clear_key, eleven_voices, run_clip, save_report])
        .run(tauri::generate_context!())
        .expect("error while running Greenroom");
}
