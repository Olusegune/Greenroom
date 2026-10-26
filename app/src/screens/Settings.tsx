import { useState } from "react";
import { api, type KeyName } from "../api";
import { useApp } from "../ctx";

export default function Settings() {
  const { keys, refreshKeys } = useApp();
  return (
    <section>
      <div>
        <h1>Settings</h1>
        <p className="lede">Your keys are saved in the Windows Credential Manager. Greenroom can use them but never shows them again, and never writes them to a file.</p>
      </div>
      <KeyCard title="ElevenLabs" hint="From elevenlabs.io, Developers, API keys. Used for speech, sound effects, voice design and cloning." fields={[["elevenlabs", "API key"]]} has={keys.elevenlabs} changed={refreshKeys} />
      <KeyCard title="VoiceKiller" hint="From voicekiller.com, API page. It needs both the API key and your user id." fields={[["voicekiller", "API key"], ["voicekiller-userid", "User id"]]} has={keys.voicekiller} changed={refreshKeys} />
      <KeyCard title="Kie" hint="From kie.ai, API Key page. Optional: used only in the Voice lab for comparison." fields={[["kie", "API key"]]} has={keys.kie} changed={refreshKeys} />
    </section>
  );
}

function KeyCard({ title, hint, fields, has, changed }: { title: string; hint: string; fields: [KeyName, string][]; has: boolean; changed: () => void }) {
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
    <div className="card">
      <div className="row between">
        <h2>{title}</h2>
        <span className={has ? "badge ok" : "badge"}>{has ? "Saved" : "Not added"}</span>
      </div>
      <p className="muted small">{hint}</p>
      <div className="row wrap">
        {fields.map(([n, label]) => (
          <input key={n} type="password" autoComplete="off" spellCheck={false} aria-label={`${title} ${label}`} placeholder={has ? `New ${label.toLowerCase()} to replace` : `Paste ${label.toLowerCase()}`} value={values[n] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} style={{ flex: 1, minWidth: 200 }} />
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
