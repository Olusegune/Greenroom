//! Kie.ai: `POST /api/v1/jobs/createTask` with `{model, input}`, then poll `GET /api/v1/jobs/recordInfo?taskId=`
//! until `state` is `success` or `fail`. Kie answers HTTP 200 even for errors, so the numeric `code` is what counts.

use crate::net::{agent, http_error, read_json, short};
use serde_json::{json, Value};
use std::time::Duration;

pub const BASE: &str = "https://api.kie.ai";
pub const DEFAULT_VOICE: &str = "EkK5I93UQWFDigLMpZcX";

pub struct Client {
    base: String,
    key: String,
    agent: ureq::Agent,
    poll: Duration,
    max_polls: u32,
}

impl Client {
    pub fn new(base: &str, key: &str) -> Self {
        Client { base: base.trim_end_matches('/').to_string(), key: key.to_string(), agent: agent(), poll: Duration::from_secs(3), max_polls: 60 }
    }

    #[cfg(test)]
    fn quick(base: &str) -> Self {
        Client { poll: Duration::ZERO, max_polls: 3, ..Client::new(base, "KIEKEY") }
    }

    fn call(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let req = self.agent.request(method, &format!("{}{path}", self.base)).set("Authorization", &format!("Bearer {}", self.key));
        let res = match body {
            Some(b) => req.set("content-type", "application/json").send_string(&b.to_string()),
            None => req.call(),
        };
        let v = match res {
            Ok(r) => read_json(r, 4 << 20)?,
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

    /// `fetch` downloads a result URL; it is a parameter so tests need no internet.
    pub fn run(&self, model: &str, input: Value, fetch: &dyn Fn(&str) -> Result<Vec<u8>, String>) -> Result<Vec<u8>, String> {
        let created = self.call("POST", "/api/v1/jobs/createTask", Some(&json!({ "model": model, "input": input })))?;
        let task = created["data"]["taskId"]
            .as_str()
            .filter(|t| !t.is_empty() && t.len() <= 100 && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
            .ok_or("Kie did not accept the job. The model name may have changed.")?
            .to_string();
        for _ in 0..self.max_polls {
            std::thread::sleep(self.poll);
            let v = self.call("GET", &format!("/api/v1/jobs/recordInfo?taskId={task}"), None)?;
            let d = &v["data"];
            match d["state"].as_str().unwrap_or("") {
                "success" => {
                    let mut found = Vec::new();
                    if let Some(p) = d["resultJson"].as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()) {
                        urls(&p, &mut found);
                    }
                    urls(&d["response"], &mut found);
                    let url = found.into_iter().next().ok_or("Kie finished but returned no audio file.")?;
                    return fetch(&url);
                }
                "fail" => return Err(format!("Kie could not make this clip. {}", short(d["failMsg"].as_str().unwrap_or("")))),
                _ => {}
            }
        }
        Err("Kie took too long. The clip may still appear in your Kie account.".into())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eleven::fake::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn creates_a_task_polls_and_downloads_the_first_result_url() {
        let polls = Arc::new(AtomicUsize::new(0));
        let p2 = polls.clone();
        let f = start(Box::new(move |h| {
            if h.method == "POST" {
                (200, json!({"code":200,"data":{"taskId":"task_1"}}).to_string().into_bytes())
            } else if p2.fetch_add(1, Ordering::SeqCst) == 0 {
                (200, json!({"code":200,"data":{"state":"waiting"}}).to_string().into_bytes())
            } else {
                (200, json!({"code":200,"data":{"state":"success","resultJson":"{\"resultUrls\":[\"https://files.example.com/a.mp3\"]}"}}).to_string().into_bytes())
            }
        }));
        let c = Client::quick(&f.base);
        let out = c.run("elevenlabs/text-to-speech-turbo-2-5", json!({"text":"hi","voice":DEFAULT_VOICE}), &|u| {
            assert_eq!(u, "https://files.example.com/a.mp3");
            Ok(vec![1, 2, 3])
        })
        .unwrap();
        assert_eq!(out, vec![1, 2, 3]);
        let hits = f.hits.lock().unwrap();
        assert!(hits[0].headers.contains("authorization: bearer kiekey"));
        let b: Value = serde_json::from_slice(&hits[0].body).unwrap();
        assert_eq!(b["model"], "elevenlabs/text-to-speech-turbo-2-5");
        assert_eq!(b["input"]["voice"], DEFAULT_VOICE);
    }

    #[test]
    fn http_200_with_an_error_code_is_an_error() {
        let f = start(Box::new(|_| (200, json!({"code":422,"msg":"voiceId cannot be empty"}).to_string().into_bytes())));
        let e = Client::quick(&f.base).run("m", json!({}), &|_| Ok(vec![])).unwrap_err();
        assert!(e.contains("422") && e.contains("voiceId cannot be empty"));
        let f2 = start(Box::new(|_| (200, json!({"code":402}).to_string().into_bytes())));
        assert!(Client::quick(&f2.base).run("m", json!({}), &|_| Ok(vec![])).unwrap_err().contains("out of credits"));
    }

    #[test]
    fn a_failed_task_reports_its_message_and_a_stuck_one_times_out() {
        let f = start(Box::new(|h| {
            if h.method == "POST" {
                (200, json!({"code":200,"data":{"taskId":"t2"}}).to_string().into_bytes())
            } else {
                (200, json!({"code":200,"data":{"state":"fail","failMsg":"Internal Error"}}).to_string().into_bytes())
            }
        }));
        assert!(Client::quick(&f.base).run("m", json!({}), &|_| Ok(vec![])).unwrap_err().contains("Internal Error"));
        let g = start(Box::new(|h| {
            if h.method == "POST" {
                (200, json!({"code":200,"data":{"taskId":"t3"}}).to_string().into_bytes())
            } else {
                (200, json!({"code":200,"data":{"state":"generating"}}).to_string().into_bytes())
            }
        }));
        assert!(Client::quick(&g.base).run("m", json!({}), &|_| Ok(vec![])).unwrap_err().contains("took too long"));
    }
}
