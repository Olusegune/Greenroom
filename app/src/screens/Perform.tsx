import { useRef, useState } from "react";
import { audioPlan, previewScene } from "../preview";
import { useApp } from "../ctx";
import { chosenTake, composeText, EMOTIONS, SOUNDS, toggleIn, vkUnsupported } from "../direct";
import { makeSound, makeTake, plan, type Model } from "../generate";
import { Plus, Play, Stop, Trash } from "../icons";
import { stopPlayback, takeUrl } from "../media";
import { uid } from "../script";
import type { Character, Line, VoiceEntry } from "../types";
import { Empty, Note, PlayButton } from "../ui";

export default function Perform() {
  const { project, edit, library, confirmSpend, toast, go } = useApp();
  const [model, setModel] = useState<Model>("eleven_v4");
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = useRef(false);
  if (!project) return null;

  const charOf = (l: Line): Character | undefined => project.characters.find((c) => c.id === l.characterId);
  const voiceOf = (l: Line): VoiceEntry | undefined => library.find((v) => v.id === charOf(l)?.voiceId);
  const patchLine = (id: string, fn: (l: Line) => Line) => edit((p) => ({ ...p, lines: p.lines.map((l) => (l.id === id ? fn(l) : l)) }));

  const spend = (lines: Line[]) => {
    const chars = lines.reduce((n, l) => n + (voiceOf(l) ? plan(l, voiceOf(l)!, model).text.length : 0), 0);
    return { chars, voices: [...new Set(lines.map((l) => voiceOf(l)?.name).filter(Boolean))].join(", ") };
  };

  const make = async (line: Line, count = 1): Promise<boolean> => {
    const voice = voiceOf(line);
    if (!voice) {
      toast("Choose a voice for this character on the Cast screen first.", true);
      return false;
    }
    const { chars } = spend([line]);
    const extra: string[] = voice.provider === "voicekiller" && vkUnsupported(line).length ? [`VoiceKiller cannot make: ${vkUnsupported(line).join(", ")}. Those will be left out.`] : [];
    const ok = await confirmSpend({ title: count > 1 ? `Make ${count} takes?` : "Make a take?", lines: [`${chars * count} characters (${count} take${count > 1 ? "s" : ""})`, `Voice: ${voice.name}`, ...extra], skipKey: count > 1 ? undefined : "take" });
    if (!ok) return false;
    try {
      for (let i = 0; i < count; i++) {
        const t = await makeTake(project.id, line, voice, model);
        patchLine(line.id, (l) => ({ ...l, takes: [...l.takes, t], chosen: t.id }));
      }
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    }
  };

  const makeAll = async () => {
    const todo = project.lines.filter((l) => l.takes.length === 0 && voiceOf(l));
    if (todo.length === 0) return toast("Every line already has a take.");
    const s = spend(todo);
    const ok = await confirmSpend({ title: "Make all the missing takes?", lines: [`${todo.length} lines, ${s.chars} characters`, `Voices: ${s.voices}`, "One take per line. You can make more later."] });
    if (!ok) return;
    stop.current = false;
    setRunning({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      if (stop.current) break;
      const line = todo[i]!;
      try {
        const t = await makeTake(project.id, line, voiceOf(line)!, model);
        patchLine(line.id, (l) => ({ ...l, takes: [...l.takes, t], chosen: t.id }));
      } catch (e) {
        toast(`Stopped at line ${project.lines.indexOf(line) + 1}: ${(e as Error).message}`, true);
        break;
      }
      setRunning({ done: i + 1, total: todo.length });
    }
    setRunning(null);
  };

  const playAll = async () => {
    if (playing) {
      stopPlayback();
      return setPlaying(false);
    }
    const p = audioPlan(project);
    if (p.items.length === 0) return toast("Make at least one take first.", true);
    setPlaying(true);
    try {
      await previewScene(project, () => setPlaying(false));
    } catch (e) {
      toast((e as Error).message, true);
      setPlaying(false);
    }
  };

  if (project.lines.length === 0) {
    return (
      <section>
        <h1>Perform</h1>
        <Empty
          title="Nothing to direct yet"
          action={
            <button className="primary" onClick={() => go("write")}>
              Write the script
            </button>
          }
        >
          Add some lines first.
        </Empty>
      </section>
    );
  }

  const missing = project.lines.filter((l) => l.takes.length === 0).length;
  const noVoice = project.lines.filter((l) => !voiceOf(l)).length;

  return (
    <section>
      <div className="row between top">
        <div>
          <h1>Perform</h1>
          <p className="lede">Pick how each line is delivered, add sounds like laughs or coughs, then make takes and choose the best. Nothing is generated until you confirm.</p>
        </div>
        <label className="field" style={{ minWidth: 190 }}>
          Speech model
          <select value={model} onChange={(e) => setModel(e.target.value as Model)}>
            <option value="eleven_v4">Eleven v4 (newest, best)</option>
            <option value="eleven_v3">Eleven v3</option>
          </select>
        </label>
      </div>
      {noVoice > 0 && (
        <Note kind="warn">
          {noVoice} line{noVoice === 1 ? " has" : "s have"} no voice yet.{" "}
          <button className="sm" onClick={() => go("cast")}>
            Go to Cast
          </button>
        </Note>
      )}
      {project.scenes.map((title, si) => {
        const lines = project.lines.filter((l) => l.scene === si);
        if (lines.length === 0) return null;
        return (
          <div key={si} className="stack">
            <h3 className="scene-title">{title}</h3>
            {lines.map((line) => (
              <LineCard key={line.id} line={line} index={project.lines.indexOf(line) + 1} character={charOf(line)} voice={voiceOf(line)} model={model} patch={(fn) => patchLine(line.id, fn)} make={make} />
            ))}
          </div>
        );
      })}
      <div className="bar">
        {running ? (
          <>
            <div style={{ flex: 1 }}>
              <div className="progress" aria-hidden="true">
                <i style={{ width: `${(running.done / running.total) * 100}%` }} />
              </div>
              <span className="small muted" role="status">
                Making takes: {running.done} of {running.total}
              </span>
            </div>
            <button onClick={() => (stop.current = true)}>Stop after this one</button>
          </>
        ) : (
          <>
            <span className="muted">
              {project.lines.length - missing} of {project.lines.length} lines have takes
            </span>
            <span className="spacer" />
            <button onClick={() => void makeAll()} disabled={missing === 0 || noVoice > 0}>
              Make all {missing} missing takes…
            </button>
            <button className="primary" onClick={() => void playAll()} disabled={project.lines.length === missing}>
              {playing ? <Stop size={14} /> : <Play size={14} />} {playing ? "Stop" : "Play the scene"}
            </button>
            <button onClick={() => go("export")}>Export</button>
          </>
        )}
      </div>
    </section>
  );
}

function LineCard({ line, index, character, voice, model, patch, make }: { line: Line; index: number; character?: Character; voice?: VoiceEntry; model: Model; patch: (fn: (l: Line) => Line) => void; make: (l: Line, n?: number) => Promise<boolean> }) {
  const { project, confirmSpend, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [snd, setSnd] = useState({ prompt: "", placement: "after" as "before" | "after", seconds: 2 });
  const d = line.direction;
  const vk = voice?.provider === "voicekiller";
  const sent = voice ? plan(line, voice, model).text : composeText(line);
  const chosen = chosenTake(line);

  const go = async (n: number) => {
    setBusy(true);
    await make(line, n);
    setBusy(false);
  };

  const addSound = async () => {
    if (!project || !snd.prompt.trim()) return;
    const ok = await confirmSpend({ title: "Make a sound clip?", lines: [`"${snd.prompt.trim()}", about ${snd.seconds} seconds`, "Uses ElevenLabs sound-effect credits"], skipKey: "sound" });
    if (!ok) return;
    setBusy(true);
    try {
      const t = await makeSound(project.id, snd.prompt.trim(), snd.seconds);
      patch((l) => ({ ...l, events: [...l.events, { id: "e-" + uid(), prompt: snd.prompt.trim(), placement: snd.placement, seconds: snd.seconds, take: t }] }));
      setSnd({ ...snd, prompt: "" });
    } catch (e) {
      toast((e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <div className="linecard">
      <div className="row between">
        <span>
          <span className="muted num small">{index}</span> <span className="speaker">{character?.name ?? "?"}</span>
          {voice && <span className="muted small"> · {voice.name}</span>}
        </span>
        {chosen ? <span className="badge ok">{line.takes.length} take{line.takes.length === 1 ? "" : "s"}</span> : <span className="badge">no take yet</span>}
      </div>
      <textarea aria-label={`Line ${index} text`} rows={2} value={line.text} onChange={(e) => patch((l) => ({ ...l, text: e.target.value }))} />
      <div className="chips" role="group" aria-label="How it is said">
        {EMOTIONS.map((e) => (
          <button key={e.tag} className="chip" aria-pressed={d.emotion === e.tag} title={e.verified ? "Heard and approved" : "Not yet listened to"} onClick={() => patch((l) => ({ ...l, direction: { ...l.direction, emotion: l.direction.emotion === e.tag ? "" : e.tag } }))}>
            {e.label}
          </button>
        ))}
        {d.emotion && !EMOTIONS.some((e) => e.tag === d.emotion) && (
          <button className="chip" aria-pressed="true" onClick={() => patch((l) => ({ ...l, direction: { ...l.direction, emotion: "" } }))}>
            {d.emotion}
          </button>
        )}
      </div>
      <div className="chips" role="group" aria-label="Sounds in the line">
        {SOUNDS.map((s) => (
          <button key={s.tag} className="chip" aria-pressed={d.sounds.includes(s.tag)} title={vk ? "VoiceKiller cannot make this" : s.verified ? "Heard and approved" : "Not yet listened to"} onClick={() => patch((l) => ({ ...l, direction: { ...l.direction, sounds: toggleIn(l.direction.sounds, s.tag) } }))}>
            {s.label}
          </button>
        ))}
      </div>
      {vk && vkUnsupported(line).length > 0 && <Note kind="warn">VoiceKiller cannot make {vkUnsupported(line).join(", ")}. Pick an ElevenLabs voice, or add a sound clip below.</Note>}
      <div className="row wrap">
        <label className="row small muted">
          Speed
          <input type="range" min={0.7} max={1.2} step={0.05} value={d.speed} aria-label="Speed" onChange={(e) => patch((l) => ({ ...l, direction: { ...l.direction, speed: Number(e.target.value) } }))} />
          <span className="num">{d.speed.toFixed(2)}×</span>
        </label>
        <label className="row small muted">
          Pause after
          <input type="range" min={0} max={3} step={0.1} value={d.pauseAfter} aria-label="Pause after" onChange={(e) => patch((l) => ({ ...l, direction: { ...l.direction, pauseAfter: Number(e.target.value) } }))} />
          <span className="num">{d.pauseAfter.toFixed(1)}s</span>
        </label>
      </div>
      <p className="sent" aria-label="What is sent">
        Sent as: <b>{sent}</b>
      </p>
      {line.takes.map((t, i) => (
        <div key={t.id} className={t.id === chosen?.id ? "take chosen" : "take"}>
          <PlayButton label={`Take ${i + 1}`} get={() => takeUrl(project!.id, t.id)} />
          <span className="muted small num">{t.seconds.toFixed(1)}s</span>
          <span className="badge">{t.model.replace("eleven_", "Eleven ")}</span>
          <span className="spacer" />
          <label className="row small">
            <input type="radio" name={`use-${line.id}`} checked={t.id === chosen?.id} onChange={() => patch((l) => ({ ...l, chosen: t.id }))} /> Use this one
          </label>
        </div>
      ))}
      {line.events.map((e) => (
        <div key={e.id} className="take">
          <PlayButton label={e.prompt.slice(0, 22)} get={() => takeUrl(project!.id, e.take!.id)} disabled={!e.take} />
          <span className="badge">sound {e.placement === "before" ? "before" : "after"}</span>
          <span className="spacer" />
          <button className="sm icon ghost" aria-label={`Remove sound ${e.prompt}`} onClick={() => patch((l) => ({ ...l, events: l.events.filter((x) => x.id !== e.id) }))}>
            <Trash size={14} />
          </button>
        </div>
      ))}
      <div className="row wrap">
        <button className="primary sm" disabled={busy || !voice} onClick={() => void go(1)}>
          {busy ? "Working…" : line.takes.length ? "Another take" : "Make a take"}
        </button>
        <button className="sm" disabled={busy || !voice} onClick={() => void go(3)}>
          Make 3 takes
        </button>
        <button className="sm ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Plus size={14} /> Sound clip (sneeze, door, steps…)
        </button>
      </div>
      {open && (
        <div className="row wrap">
          <input type="text" aria-label="Describe the sound" placeholder="A woman sneezing once" value={snd.prompt} onChange={(e) => setSnd({ ...snd, prompt: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <select aria-label="Where" value={snd.placement} onChange={(e) => setSnd({ ...snd, placement: e.target.value as "before" | "after" })}>
            <option value="after">after the line</option>
            <option value="before">before the line</option>
          </select>
          <select aria-label="Length" value={snd.seconds} onChange={(e) => setSnd({ ...snd, seconds: Number(e.target.value) })}>
            {[1, 2, 3, 5, 8].map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
          <button className="sm primary" disabled={!snd.prompt.trim() || busy} onClick={() => void addSound()}>
            Make sound
          </button>
        </div>
      )}
    </div>
  );
}
