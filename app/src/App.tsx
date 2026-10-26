import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, toUrl, type Voice } from "./api";
import { buildReport, CLIPS, countByProvider, PROVIDER_INFO, type KeyName, type Result } from "./lab";

type Tab = "lab" | "settings";
type Keys = Record<KeyName, boolean>;

export default function App() {
  const [tab, setTab] = useState<Tab>("lab");
  const [keys, setKeys] = useState<Keys>({ elevenlabs: false, kie: false });
  const refreshKeys = useCallback(() => void api.keyStatus().then(setKeys).catch(() => undefined), []);
  useEffect(refreshKeys, [refreshKeys]);
  const [splash, setSplash] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    const a = setTimeout(() => setSplash("fade"), 2200);
    const b = setTimeout(() => setSplash("gone"), 2900);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);

  return (
    <>
      {splash !== "gone" && (
        <div className={splash === "fade" ? "splash out" : "splash"} onClick={() => setSplash("gone")} role="presentation">
          <img src="/splash.webp" alt="Greenroom. Sound without limits." />
        </div>
      )}
      <Main tab={tab} setTab={setTab} keys={keys} refreshKeys={refreshKeys} />
    </>
  );
}

function Main({ tab, setTab, keys, refreshKeys }: { tab: Tab; setTab: (t: Tab) => void; keys: Keys; refreshKeys: () => void }) {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          Greenroom
        </div>
        <button className={tab === "lab" ? "nav on" : "nav"} onClick={() => setTab("lab")}>
          Listening Lab
        </button>
        <button className={tab === "settings" ? "nav on" : "nav"} onClick={() => setTab("settings")}>
          Settings
        </button>
        <p className="rail-note">Slice 0. The real scene screen comes next, once we know which voices sound alive.</p>
      </nav>
      <main className="stage">{tab === "lab" ? <Lab keys={keys} goSettings={() => setTab("settings")} /> : <Settings keys={keys} changed={refreshKeys} />}</main>
    </div>
  );
}

function Settings({ keys, changed }: { keys: Keys; changed: () => void }) {
  return (
    <section>
      <h1>Settings</h1>
      <p className="lede">Your keys are saved in the Windows Credential Manager. Greenroom can use them but never shows them again.</p>
      <KeyCard name="elevenlabs" title="ElevenLabs" hint="From elevenlabs.io, Developers, API keys." has={keys.elevenlabs} changed={changed} />
      <KeyCard name="kie" title="Kie" hint="From kie.ai, API Key page." has={keys.kie} changed={changed} />
    </section>
  );
}

function KeyCard({ name, title, hint, has, changed }: { name: KeyName; title: string; hint: string; has: boolean; changed: () => void }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    try {
      await api.setKey(name, value);
      setValue("");
      setMsg({ ok: true, text: "Saved." });
      changed();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const remove = async () => {
    try {
      await api.clearKey(name);
      setMsg({ ok: true, text: "Removed." });
      changed();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <div className="card">
      <div className="row between">
        <h2>{title}</h2>
        <span className={has ? "pill ok" : "pill"}>{has ? "Key saved" : "No key yet"}</span>
      </div>
      <p className="muted">{hint}</p>
      <div className="row">
        <input type="password" autoComplete="off" spellCheck={false} aria-label={`${title} API key`} placeholder={has ? "Paste a new key to replace it" : "Paste your key"} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" disabled={!value.trim()} onClick={save}>
          Save
        </button>
        {has && <button onClick={remove}>Remove</button>}
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "okmsg" : "err"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function Lab({ keys, goSettings }: { keys: Keys; goSettings: () => void }) {
  const available = useMemo(() => CLIPS.filter((c) => keys[PROVIDER_INFO[c.provider].key]), [keys]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, Result>>({});
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("");
  const [voiceErr, setVoiceErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState("");
  const stop = useRef(false);

  // Start with everything the saved keys allow ticked.
  useEffect(() => setPicked(new Set(available.map((c) => c.id))), [available]);

  useEffect(() => {
    if (!keys.elevenlabs) return;
    api
      .voices()
      .then((v) => {
        setVoices(v);
        setVoice((cur) => cur || v[0]?.id || "");
        setVoiceErr("");
      })
      .catch((e: Error) => setVoiceErr(e.message));
  }, [keys.elevenlabs]);

  const chosen = available.filter((c) => picked.has(c.id));
  const summary = countByProvider(chosen);
  const patch = (id: string, r: Partial<Result>) => setResults((all) => ({ ...all, [id]: { state: "idle", ...all[id], ...r } }));

  const run = async () => {
    setConfirm(false);
    setRunning(true);
    stop.current = false;
    for (const c of chosen) {
      if (stop.current) break;
      patch(c.id, { state: "running", error: undefined });
      try {
        const out = await api.runClip(c.provider, c.text, voice);
        patch(c.id, { state: "done", url: toUrl(out), ms: out.ms });
      } catch (e) {
        patch(c.id, { state: "error", error: (e as Error).message });
      }
    }
    setRunning(false);
  };

  const save = async () => {
    try {
      setSaved(await api.saveReport(buildReport(results, new Date().toISOString().slice(0, 10))));
    } catch (e) {
      setSaved((e as Error).message);
    }
  };

  if (!keys.elevenlabs && !keys.kie) {
    return (
      <section>
        <h1>Listening Lab</h1>
        <div className="card empty">
          <h2>Add a key to begin</h2>
          <p className="muted">The lab asks ElevenLabs and Kie for the same short lines, so you can hear which one sounds most alive.</p>
          <button className="primary" onClick={goSettings}>
            Open Settings
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Listening Lab</h1>
      <p className="lede">The same lines, rendered by each provider. Play them, rate 1 to 5, then save the report. Nothing runs until you confirm.</p>
      {keys.elevenlabs && (
        <div className="row voice">
          <label htmlFor="v">ElevenLabs voice</label>
          <select id="v" value={voice} onChange={(e) => setVoice(e.target.value)} disabled={voices.length === 0}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {voiceErr && <span className="err">{voiceErr}</span>}
        </div>
      )}
      {(["Speech with feeling", "Body sounds"] as const).map((g) => (
        <div key={g} className="card">
          <h2>{g}</h2>
          {CLIPS.filter((c) => c.group === g).map((c) => {
            const usable = keys[PROVIDER_INFO[c.provider].key];
            const r = results[c.id];
            return (
              <div key={c.id} className={usable ? "clip" : "clip off"}>
                <label className="row between top">
                  <span className="row">
                    <input type="checkbox" disabled={!usable || running} checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                    <span>
                      <strong>{c.title}</strong> <span className="tag">{PROVIDER_INFO[c.provider].label}</span>
                    </span>
                  </span>
                  <span className="muted small">{usable ? "" : "needs " + PROVIDER_INFO[c.provider].key + " key"}</span>
                </label>
                <p className="line">{c.text}</p>
                <p className="muted small">Listen for: {c.listenFor}. {PROVIDER_INFO[c.provider].note}.</p>
                {r?.state === "running" && <p className="muted" role="status">Making this clip…</p>}
                {r?.state === "error" && <p className="err" role="alert">{r.error}</p>}
                {r?.state === "done" && r.url && (
                  <div className="row wrap">
                    <audio controls src={r.url} preload="auto" />
                    <span className="rate" role="group" aria-label={`Rate ${c.title}`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} className={r.rating === n ? "star on" : "star"} aria-pressed={r.rating === n} onClick={() => patch(c.id, { rating: n })}>
                          {n}
                        </button>
                      ))}
                    </span>
                    <input className="notes" placeholder="Note (optional)" aria-label={`Note for ${c.title}`} value={r.note ?? ""} onChange={(e) => patch(c.id, { note: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="bar">
        <span>{chosen.length} clips selected</span>
        {running ? (
          <button onClick={() => (stop.current = true)}>Stop after this clip</button>
        ) : (
          <button className="primary" disabled={chosen.length === 0 || (keys.elevenlabs && chosen.some((c) => c.provider === "eleven-tts" || c.provider === "eleven-v4") && !voice)} onClick={() => setConfirm(true)}>
            Run {chosen.length} clips…
          </button>
        )}
        <button onClick={save} disabled={Object.keys(results).length === 0}>
          Save report
        </button>
        {saved && <span className="muted small" role="status">{saved}</span>}
      </div>
      {confirm && (
        <div className="sheet-back" role="presentation">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ct">
            <h2 id="ct">Run these clips?</h2>
            <p className="muted">This sends the test lines below to the providers and uses your own accounts. Greenroom cannot see your price, so check your plan or credits first.</p>
            <ul>
              {summary.map((s) => (
                <li key={s.provider}>
                  <strong>{PROVIDER_INFO[s.provider].label}</strong>: {s.n} clips, {s.chars} characters
                </li>
              ))}
            </ul>
            <div className="row end">
              <button onClick={() => setConfirm(false)}>Cancel</button>
              <button className="primary" autoFocus onClick={run}>
                Run and use credits
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
