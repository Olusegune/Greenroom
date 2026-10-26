import { useState } from "react";
import { useApp } from "../ctx";
import { ENGINES, ENGINE_ORDER, type Engine } from "../engines";
import { Flag } from "../flags";
import { ChevronRight } from "../icons";
import { TILES, tileByName } from "../languages";
import { Empty, Note, PlayButton } from "../ui";
import { useSample, voiceLine } from "../useSample";

export default function Cast() {
  const { project, edit, library, go } = useApp();
  const sample = useSample();
  const [engine, setEngine] = useState<Engine | "all">("all");
  if (!project) return null;

  const used = new Set(project.lines.map((l) => l.characterId));
  const cast = project.characters.filter((c) => used.has(c.id));
  const missing = cast.filter((c) => !c.voiceId || !library.some((v) => v.id === c.voiceId)).length;
  const present = ENGINE_ORDER.filter((e) => library.some((v) => v.provider === e));

  const patch = (id: string, p: Partial<(typeof project.characters)[number]>) => edit((pr) => ({ ...pr, characters: pr.characters.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  if (cast.length === 0) {
    return (
      <section>
        <h1>Cast</h1>
        <Empty
          title="No characters yet"
          action={
            <button className="primary" onClick={() => go("write")}>
              Write the script
            </button>
          }
        >
          Characters appear here as soon as your script has lines like ADA: Hello.
        </Empty>
      </section>
    );
  }

  return (
    <section>
      <div>
        <h1>Cast</h1>
        <p className="lede">Choose a voice for each character. The language is a reminder of how they speak: the voice you pick decides the accent and the engine.</p>
      </div>
      {library.length === 0 && (
        <Note kind="warn">
          Your voice library is empty.{" "}
          <button className="sm" onClick={() => go("voices")}>
            Find or make a voice
          </button>
        </Note>
      )}
      {present.length > 1 && (
        <div className="row wrap">
          <span className="muted small">Choose from</span>
          <span className="chips" role="group" aria-label="Engine">
            <button className="chip" aria-pressed={engine === "all"} onClick={() => setEngine("all")}>
              All engines
            </button>
            {present.map((e) => (
              <button key={e} className="chip" aria-pressed={engine === e} onClick={() => setEngine(e)}>
                {ENGINES[e].label}
              </button>
            ))}
          </span>
        </div>
      )}
      <div className="grid">
        {cast.map((c) => {
          const voice = library.find((v) => v.id === c.voiceId);
          const first = project.lines.find((l) => l.characterId === c.id);
          const options = library.filter((v) => engine === "all" || v.provider === engine || v.id === c.voiceId);
          const tile = tileByName(c.language);
          return (
            <div key={c.id} className={voice ? "card voice-card lit" : "card voice-card"}>
              <div className="row between">
                <h2 className="speaker">{c.name}</h2>
                <span className={voice ? "badge ok" : "badge warn"}>{voice ? ENGINES[voice.provider].label : "No voice yet"}</span>
              </div>
              <label className="field">
                Voice
                <select value={c.voiceId ?? ""} onChange={(e) => patch(c.id, { voiceId: e.target.value || undefined })}>
                  <option value="">Choose a voice…</option>
                  {options.map((v) => (
                    <option key={v.provider + v.id} value={v.id}>
                      {v.name} {voiceLine(v) ? `(${voiceLine(v)})` : ""} · {ENGINES[v.provider].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Language they speak
                <span className="row">
                  {tile ? <Flag cc={tile.cc} /> : <span className="flag-ph" style={{ width: 22, height: 16 }} />}
                  <select value={c.language} onChange={(e) => patch(c.id, { language: e.target.value })} style={{ flex: 1 }}>
                    {!TILES.some((t) => t.name === c.language) && <option value={c.language}>{c.language}</option>}
                    {TILES.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              {voice && first && <PlayButton label={`Hear ${c.name}'s first line`} get={() => sample(voice, first.text.replace(/\[[^\]]*\]/g, "").trim() || first.text)} />}
            </div>
          );
        })}
      </div>
      <Pronunciations />
      <div className="row">
        {missing > 0 ? <span className="muted">{missing} character{missing === 1 ? "" : "s"} still need a voice.</span> : <span className="ok-text">Everyone has a voice.</span>}
        <span className="spacer" />
        <button className="primary" onClick={() => go("perform")} disabled={missing > 0}>
          Direct the performance <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}

/** Names and words that voices get wrong. The swap is made only in what is sent, so the script and the line text stay as written. */
function Pronunciations() {
  const { project, edit } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!project) return null;
  const rules = project.pronunciations ?? [];
  const add = () => {
    if (!from.trim() || !to.trim()) return;
    edit((p) => ({ ...p, pronunciations: [...(p.pronunciations ?? []).filter((r) => r.from.toLowerCase() !== from.trim().toLowerCase()), { from: from.trim(), to: to.trim() }] }));
    setFrom("");
    setTo("");
  };
  return (
    <div className="card stack">
      <h2>Pronunciation</h2>
      <p className="muted small">If a voice says a name wrong, write how it should sound, for example Tunde becomes Toon-day. Only what is sent to the voice changes. Takes you already made keep their old sound, so make new ones.</p>
      {rules.map((r) => (
        <div key={r.from} className="row between">
          <span>
            <code>{r.from}</code> → <code>{r.to}</code>
          </span>
          <button className="sm ghost" aria-label={`Remove ${r.from}`} onClick={() => edit((p) => ({ ...p, pronunciations: (p.pronunciations ?? []).filter((x) => x.from !== r.from) }))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row wrap">
        <input type="text" aria-label="Written as" placeholder="Written as: Tunde" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="text" aria-label="Spoken as" placeholder="Spoken as: Toon-day" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button disabled={!from.trim() || !to.trim()} onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
