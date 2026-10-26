import { useApp } from "../ctx";
import { ChevronRight } from "../icons";
import { LANGUAGES, MIXED_LANGUAGES } from "../languages";
import { Empty, Note, PlayButton } from "../ui";
import { useSample, voiceLine } from "../useSample";

export default function Cast() {
  const { project, edit, library, go } = useApp();
  const sample = useSample();
  if (!project) return null;

  const used = new Set(project.lines.map((l) => l.characterId));
  const cast = project.characters.filter((c) => used.has(c.id));
  const missing = cast.filter((c) => !c.voiceId || !library.some((v) => v.id === c.voiceId)).length;

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
        <p className="lede">Choose a voice for each character. The language is a reminder of how they speak: the voice you pick decides the accent, so choose one that fits.</p>
      </div>
      {library.length === 0 && (
        <Note kind="warn">
          Your voice library is empty.{" "}
          <button className="sm" onClick={() => go("voices")}>
            Find or make a voice
          </button>
        </Note>
      )}
      <div className="grid">
        {cast.map((c) => {
          const voice = library.find((v) => v.id === c.voiceId);
          const first = project.lines.find((l) => l.characterId === c.id);
          return (
            <div key={c.id} className={voice ? "card voice-card lit" : "card voice-card"}>
              <div className="row between">
                <h2 className="speaker">{c.name}</h2>
                <span className={voice ? "badge ok" : "badge warn"}>{voice ? "Voice chosen" : "No voice yet"}</span>
              </div>
              <label className="field">
                Voice
                <select value={c.voiceId ?? ""} onChange={(e) => patch(c.id, { voiceId: e.target.value || undefined })}>
                  <option value="">Choose a voice…</option>
                  {library.map((v) => (
                    <option key={v.provider + v.id} value={v.id}>
                      {v.name} {voiceLine(v) ? `(${voiceLine(v)})` : ""} {v.provider === "voicekiller" ? "· VoiceKiller" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Language they speak
                <select value={c.language} onChange={(e) => patch(c.id, { language: e.target.value })}>
                  {[...LANGUAGES.map((l) => l.name), ...MIXED_LANGUAGES].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {voice && first && <PlayButton label={`Hear ${c.name}'s first line`} get={() => sample(voice, first.text.replace(/\[[^\]]*\]/g, "").trim() || first.text)} />}
            </div>
          );
        })}
      </div>
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
