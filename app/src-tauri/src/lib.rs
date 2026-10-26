//! Greenroom backend. Keys live only in the Windows Credential Manager and are never returned to the UI.
//! Every paid call is a command the UI makes only after the owner confirms the cost sheet.

mod eleven;
mod kie;
mod local;
mod net;
mod store;
mod voicekiller;

use base64::Engine;
use eleven::VoiceInfo;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::Manager;

const SERVICE: &str = "Greenroom";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !matches!(name, "elevenlabs" | "kie" | "voicekiller" | "voicekiller-userid") {
        return Err("Unknown provider.".into());
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| format!("Could not reach the Windows Credential Manager: {e}"))
}

fn get_key(name: &str) -> Result<String, String> {
    let who = match name {
        "kie" => "Kie",
        "voicekiller" | "voicekiller-userid" => "VoiceKiller",
        _ => "ElevenLabs",
    };
    match entry(name)?.get_password() {
        Ok(k) if !k.trim().is_empty() => Ok(k.trim().to_string()),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(format!("Add your {who} key in Settings first.")),
        Err(e) => Err(format!("Could not read the Windows Credential Manager: {e}")),
    }
}

fn eleven() -> Result<eleven::Client, String> {
    Ok(eleven::Client::new(eleven::BASE, &get_key("elevenlabs")?))
}

fn voicekiller_client() -> Result<voicekiller::Client, String> {
    Ok(voicekiller::Client::new(voicekiller::BASE, &get_key("voicekiller")?, &get_key("voicekiller-userid")?))
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().document_dir().map_err(|_| "Could not find your Documents folder.".to_string())?.join("Greenroom"))
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn unb64(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD.decode(s).map_err(|_| "The audio data was not valid.".to_string())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| "The request was interrupted.".to_string())?
}

// ---- keys -----------------------------------------------------------------------------------------------------

#[derive(Serialize)]
struct KeyStatus {
    elevenlabs: bool,
    kie: bool,
    voicekiller: bool,
}

#[tauri::command]
fn key_status() -> KeyStatus {
    let has = |n: &str| entry(n).ok().and_then(|e| e.get_password().ok()).map(|k| !k.trim().is_empty()).unwrap_or(false);
    KeyStatus { elevenlabs: has("elevenlabs"), kie: has("kie"), voicekiller: has("voicekiller") && has("voicekiller-userid") }
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

// ---- generating audio -----------------------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipReq {
    provider: String,
    text: String,
    voice: Option<String>,
    speed: Option<f64>,
    seconds: Option<f64>,
    instructions: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipOut {
    audio_b64: String,
    mime: String,
    ms: u128,
}

fn make_clip(root: &std::path::Path, req: ClipReq) -> Result<Vec<u8>, String> {
    let text = req.text.trim();
    if text.is_empty() || text.len() > 9000 {
        return Err("The text is empty or too long.".into());
    }
    let voice = req.voice.clone().unwrap_or_default();
    match req.provider.as_str() {
        "eleven-v4" => eleven()?.speech(&voice, eleven::MODEL_V4, text, req.speed),
        "eleven-tts" => eleven()?.speech(&voice, eleven::MODEL_V3, text, req.speed),
        "eleven-sfx" => eleven()?.sound(text, req.seconds.unwrap_or(3.0)),
        "piper" => local::piper_speak(root, &voice, text, req.speed.unwrap_or(1.0), &local::RealRunner),
        "local" => local::server_speak(&server_cfg(root), text, &voice, req.speed.unwrap_or(1.0)),
        p @ ("voicekiller" | "voicekiller-clone") => voicekiller_client()?.speak(text, &voice, req.instructions.as_deref(), p == "voicekiller-clone"),
        p @ ("kie-tts" | "kie-dialogue" | "kie-sfx") => {
            let c = kie::Client::new(kie::BASE, &get_key("kie")?);
            let fetch = |u: &str| net::download(u, net::MAX_AUDIO);
            match p {
                "kie-tts" => {
                    let v = if voice.is_empty() { kie::DEFAULT_VOICE.to_string() } else { voice.clone() };
                    if !eleven::valid_id(&v) {
                        return Err("That Kie voice is not valid.".into());
                    }
                    let mut input = serde_json::json!({ "text": text, "voice": v });
                    if let Some(sp) = req.speed.filter(|x| (x - 1.0).abs() > 0.001) {
                        input["speed"] = serde_json::json!(sp.clamp(0.7, 1.2));
                    }
                    c.run("elevenlabs/text-to-speech-turbo-2-5", input, &fetch)
                }
                "kie-dialogue" => c.run("elevenlabs/text-to-dialogue-v3", serde_json::json!({ "dialogue": [{ "text": text, "voice": kie::DEFAULT_VOICE }] }), &fetch),
                _ => c.run("elevenlabs/sound-effect-v2", serde_json::json!({ "text": text }), &fetch),
            }
        }
        _ => Err("Unknown test type.".into()),
    }
}

#[tauri::command]
async fn run_clip(app: tauri::AppHandle, req: ClipReq) -> Result<ClipOut, String> {
    let dir = root(&app)?;
    blocking(move || {
        let t = Instant::now();
        let bytes = make_clip(&dir, req)?;
        if bytes.len() < 200 {
            return Err("The provider returned an empty clip.".to_string());
        }
        Ok(ClipOut { mime: net::mime_of(&bytes).into(), audio_b64: b64(&bytes), ms: t.elapsed().as_millis() })
    })
    .await
}

// ---- voices ---------------------------------------------------------------------------------------------------

#[tauri::command]
async fn voices_voicekiller() -> Result<Vec<voicekiller::VkVoice>, String> {
    blocking(|| voicekiller_client()?.voices()).await
}

#[tauri::command]
async fn voices_mine() -> Result<Vec<VoiceInfo>, String> {
    blocking(|| eleven()?.my_voices()).await
}

#[derive(Serialize)]
struct SharedPage {
    voices: Vec<VoiceInfo>,
    more: bool,
}

#[tauri::command]
async fn voices_shared(search: String, language: String, accent: String, gender: String, page: u32) -> Result<SharedPage, String> {
    blocking(move || eleven()?.shared_voices(&search, &language, &accent, &gender, page).map(|(voices, more)| SharedPage { voices, more })).await
}

#[tauri::command]
async fn voice_add_shared(owner: String, voice: String, name: String) -> Result<String, String> {
    blocking(move || eleven()?.add_shared(&owner, &voice, &name)).await
}

#[tauri::command]
async fn voice_design(description: String, sample: Option<String>) -> Result<Vec<eleven::DesignPreview>, String> {
    blocking(move || eleven()?.design(&description, sample.as_deref())).await
}

#[tauri::command]
async fn voice_design_save(generated: String, name: String, description: String) -> Result<String, String> {
    blocking(move || eleven()?.save_design(&generated, &name, &description)).await
}

/// Cloning needs the owner's confirmation that they have the speaker's permission; the UI sends it, and it is checked
/// again here so no other path can skip it.
#[tauri::command]
async fn voice_clone(name: String, filename: String, mime: String, audio_b64: String, permission: bool) -> Result<String, String> {
    if !permission {
        return Err("Confirm that you have permission to clone this voice first.".into());
    }
    blocking(move || eleven()?.clone_voice(&name, &filename, &mime, &unb64(&audio_b64)?)).await
}

#[tauri::command]
async fn voice_delete(id: String) -> Result<(), String> {
    blocking(move || eleven()?.delete_voice(&id)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Audio {
    audio_b64: String,
    mime: String,
}

#[tauri::command]
async fn preview_fetch(url: String) -> Result<Audio, String> {
    blocking(move || {
        let bytes = net::download(&url, 6 << 20)?;
        Ok(Audio { mime: net::mime_of(&bytes).into(), audio_b64: b64(&bytes) })
    })
    .await
}

// ---- projects, takes, library, exports ------------------------------------------------------------------------

#[tauri::command]
fn project_list(app: tauri::AppHandle) -> Result<Vec<store::ProjectInfo>, String> {
    Ok(store::project_list(&root(&app)?))
}

#[tauri::command]
fn project_load(app: tauri::AppHandle, id: String) -> Result<String, String> {
    store::project_load(&root(&app)?, &id)
}

#[tauri::command]
fn project_save(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    store::project_save(&root(&app)?, &id, &json)
}

#[tauri::command]
fn take_write(app: tauri::AppHandle, project: String, take: String, ext: String, audio_b64: String) -> Result<(), String> {
    store::take_write(&root(&app)?, &project, &take, &ext, &unb64(&audio_b64)?)
}

#[tauri::command]
fn take_read(app: tauri::AppHandle, project: String, take: String) -> Result<Audio, String> {
    let bytes = store::take_read(&root(&app)?, &project, &take)?;
    Ok(Audio { mime: net::mime_of(&bytes).into(), audio_b64: b64(&bytes) })
}

#[tauri::command]
fn export_write(app: tauri::AppHandle, project: String, folder: String, filename: String, audio_b64: String) -> Result<String, String> {
    Ok(store::export_write(&root(&app)?, &project, &folder, &filename, &unb64(&audio_b64)?)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn library_load(app: tauri::AppHandle) -> Result<String, String> {
    Ok(store::library_load(&root(&app)?))
}

#[tauri::command]
fn library_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    store::library_save(&root(&app)?, &json)
}

/// Saves the Listening Lab ratings as a Markdown report in Documents\Greenroom.
#[tauri::command]
fn save_report(app: tauri::AppHandle, text: String) -> Result<String, String> {
    if text.len() > 200_000 {
        return Err("The report is too large.".into());
    }
    let file = root(&app)?.join("listening-report.md");
    store::atomic_write(&file, text.as_bytes())?;
    Ok(file.to_string_lossy().into_owned())
}

// ---- engines: local server settings, Piper ---------------------------------------------------------------------

fn server_cfg(root: &std::path::Path) -> local::ServerCfg {
    std::fs::read_to_string(root.join("engines.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| serde_json::from_value(v["localServer"].clone()).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn engines_load(app: tauri::AppHandle) -> Result<String, String> {
    Ok(std::fs::read_to_string(root(&app)?.join("engines.json")).unwrap_or_else(|_| "{}".into()))
}

#[tauri::command]
fn engines_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    if json.len() > 64 * 1024 || !serde_json::from_str::<serde_json::Value>(&json).map(|v| v.is_object()).unwrap_or(false) {
        return Err("The engine settings were not valid.".into());
    }
    store::atomic_write(&root(&app)?.join("engines.json"), json.as_bytes())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PiperStatus {
    installed: bool,
    voices: Vec<String>,
}

#[tauri::command]
fn piper_status(app: tauri::AppHandle) -> Result<PiperStatus, String> {
    let r = root(&app)?;
    Ok(PiperStatus { installed: local::piper_installed(&r), voices: local::installed_voices(&r) })
}

fn fetcher(url: &str, max: u64) -> Result<Vec<u8>, String> {
    net::download(url, max)
}

#[tauri::command]
async fn piper_install(app: tauri::AppHandle) -> Result<(), String> {
    let r = root(&app)?;
    blocking(move || local::install_piper(&r, local::PIPER_URL, local::PIPER_SIZE, local::PIPER_SHA256, &fetcher)).await
}

static CATALOG: Mutex<Option<Vec<local::PiperVoice>>> = Mutex::new(None);

fn catalog() -> Result<Vec<local::PiperVoice>, String> {
    if let Some(c) = CATALOG.lock().map_err(|_| "busy")?.clone() {
        return Ok(c);
    }
    let bytes = net::download(local::CATALOG_URL, 8 << 20)?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "The voice catalogue was not understood.".to_string())?;
    let list = local::parse_catalog(&v);
    if list.is_empty() {
        return Err("The voice catalogue was empty.".into());
    }
    *CATALOG.lock().map_err(|_| "busy")? = Some(list.clone());
    Ok(list)
}

#[tauri::command]
async fn piper_catalog() -> Result<Vec<local::PiperVoice>, String> {
    blocking(catalog).await
}

#[tauri::command]
async fn piper_install_voice(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let r = root(&app)?;
    blocking(move || {
        let v = catalog()?.into_iter().find(|v| v.key == key).ok_or("That voice is not in the catalogue.")?;
        local::install_voice(&r, &v, local::VOICES_BASE, &fetcher)
    })
    .await
}

#[tauri::command]
fn piper_remove_voice(app: tauri::AppHandle, key: String) -> Result<(), String> {
    local::remove_voice(&root(&app)?, &key)
}

#[tauri::command]
async fn local_voices(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let cfg = server_cfg(&root(&app)?);
    blocking(move || local::server_voices(&cfg)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            key_status, set_key, clear_key, run_clip, voices_mine, voices_voicekiller, voices_shared, voice_add_shared, voice_design, voice_design_save, voice_clone,
            voice_delete, preview_fetch, project_list, project_load, project_save, take_write, take_read, export_write, library_load, library_save,
            save_report, engines_load, engines_save, piper_status, piper_install, piper_catalog, piper_install_voice, piper_remove_voice, local_voices
        ])
        .run(tauri::generate_context!())
        .expect("error while running Greenroom");
}
