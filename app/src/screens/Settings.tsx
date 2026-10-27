import { useState } from "react";
import { api, type KeyName } from "../api";
import { useApp } from "../ctx";
import { APP_VERSION } from "../version";

export default function Settings() {
  const { keys, refreshKeys } = useApp();
  return (
    <section>
      <div>
        <h1>Settings</h1>
        <p className="lede">Your keys are saved in the Windows Credential Manager. Greenroom can use them but never shows them again, and never writes them to a file.</p>
      </div>
      <KeyCard mark="E" tone="e1" title="ElevenLabs" hint="From elevenlabs.io, Developers, API keys. Used for speech, sound effects, voice design and cloning." fields={[["elevenlabs", "API key"]]} has={keys.elevenlabs} changed={refreshKeys} />
      <KeyCard mark="V" tone="e2" title="VoiceKiller" hint="From voicekiller.com, API page. It needs both the API key and your user id." fields={[["voicekiller", "API key"], ["voicekiller-userid", "User id"]]} has={keys.voicekiller} changed={refreshKeys} />
      <KeyCard mark="K" tone="e3" title="Kie" hint="From kie.ai, API Key page. Used for Kie voices, sound effects, the AI Director and Suno music." fields={[["kie", "API key"]]} has={keys.kie} changed={refreshKeys} />
      <div className="card stack">
        <h2>About</h2>
        <p className="muted small">
          Greenroom {APP_VERSION}. Everything you make (projects, takes, voices, backups and exports) is kept on this computer in Documents\Greenroom. Only the text of a line, a description or a style is sent to a provider, and only when you confirm.
        </p>
      </div>
    </section>
  );
}

function KeyCard({ mark, tone, title, hint, fields, has, changed }: { mark: string; tone: string; title: string; hint: string; fields: [KeyName, string][]; has: boolean; changed: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const filled = fields.every(([n]) => (values[n] ?? "").trim());
  const save = async () => {
    try {
      for (const [n] of fields) await api.setKey(n, values[n] ?? "");
      setValues({});
      setMsg({ ok: true, text: "Saved." });
      changed();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const remove = async () => {
    try {
      for (const [n] of fields) await api.clearKey(n);
      setMsg({ ok: true, text: "Removed." });
      changed();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <div className="card stack">
      <div className="row between">
        <span className="row" style={{ gap: 14 }}>
          <span className={`eng-mark ${tone}`} aria-hidden="true">
            {mark}
          </span>
          <span className="eng-id">
            <strong>{title}</strong>
            <span className="muted small">{hint}</span>
          </span>
        </span>
        <span className={has ? "badge ok" : "badge"}>{has ? "Saved" : "Not added"}</span>
      </div>
      <div className="row wrap">
        {fields.map(([n, label]) => (
          <input key={n} type="password" autoComplete="off" spellCheck={false} aria-label={`${title} ${label}`} placeholder={has ? `New ${label === "API key" ? label : label.toLowerCase()} to replace` : `Paste ${label === "API key" ? label : label.toLowerCase()}`} value={values[n] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} style={{ flex: 1, minWidth: 200 }} />
        ))}
        <button className="primary" disabled={!filled} onClick={save}>
          Save
        </button>
        {has && (
          <button onClick={remove} className="danger">
            Remove
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "ok-text small" : "err-text small"} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
