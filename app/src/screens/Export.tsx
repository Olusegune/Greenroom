import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, inApp } from "../api";
import { fmtTime, lineFileName } from "../audio";
import { useApp } from "../ctx";
import { chosenTake } from "../direct";
import { makeSound } from "../generate";
import { stopPlayback, takeAudio, takeUrl } from "../media";
import { audioPlan, mixToWav, wavBase64 } from "../preview";
import { Empty, Note, PlayButton, useBusy } from "../ui";

export default function Export() {
  const { project, edit, confirmSpend, toast, go, keys } = useApp();
  const { busy, run } = useBusy();
  const [opts, setOpts] = useState({ whole: true, scenes: false, lines: true });
  const [made, setMade] = useState<string[]>([]);
  const [bedSecs, setBedSecs] = useState(12);
  if (!project) return null;

  const plan = audioPlan(project);
  const missing = project.lines.filter((l) => !chosenTake(l));
  const stem = project.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Greenroom";

  if (project.lines.length === 0) {
    return (
      <section>
        <h1>Export</h1>
        <Empty
          title="Nothing to export yet"
          action={
            <button className="primary" onClick={() => go("write")}>
              Write the script
            </button>
          }
        >
          Write a script and make some takes first.
        </Empty>
      </section>
    );
  }

  const makeBed = async () => {
    if (!project.bed.prompt.trim()) return;
    const ok = await confirmSpend({ title: "Make the atmosphere?", lines: [`"${project.bed.prompt.trim()}", ${bedSecs} seconds, looped under the scene`, "Uses ElevenLabs sound-effect credits"] });
    if (!ok) return;
    await run(async () => {
      try {
        const t = await makeSound(project.id, project.bed.prompt.trim(), bedSecs);
        edit((p) => ({ ...p, bed: { ...p.bed, take: t } }));
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
  };

  const doExport = () =>
    run(async () => {
      const out: string[] = [];
      try {
        if (opts.whole) out.push(await api.exportWrite(project.id, "", `${stem} - full scene.wav`, wavBase64(await mixToWav(project, plan))));
        if (opts.scenes) {
          for (let i = 0; i < project.scenes.length; i++) {
            const sp = audioPlan(project, i);
            if (sp.items.length === 0) continue;
            const title = project.scenes[i]!.replace(/[^\p{L}\p{N} _-]+/gu, "").trim();
            out.push(await api.exportWrite(project.id, "", `${stem} - scene ${i + 1} ${title}.wav`.replace(/ +/g, " "), wavBase64(await mixToWav(project, sp))));
          }
        }
        if (opts.lines) {
          for (const [i, l] of project.lines.entries()) {
            const t = chosenTake(l);
            if (!t) continue;
            const who = project.characters.find((c) => c.id === l.characterId)?.name ?? "Line";
            const a = await takeAudio(project.id, t.id);
            out.push(await api.exportWrite(project.id, `Lines - ${who}`, lineFileName(i, who, t.ext), a.audioB64));
          }
        }
        setMade(out);
        toast(`Exported ${out.length} file${out.length === 1 ? "" : "s"}.`);
      } catch (e) {
        toast((e as Error).message, true);
      }
    });

  const reveal = async (path: string) => {
    if (!inApp()) return;
    try {
      await revealItemInDir(path);
    } catch {
      toast("Could not open the folder.", true);
    }
  };

  return (
    <section>
      <div>
        <h1>Export</h1>
        <p className="lede">Mixes your chosen takes in order, with the pauses and sound clips you set, and saves the audio in Documents\Greenroom.</p>
      </div>
      {missing.length > 0 && (
        <Note kind="warn">
          {missing.length} line{missing.length === 1 ? " has" : "s have"} no take and will be left out.{" "}
          <button className="sm" onClick={() => go("perform")}>
            Back to Perform
          </button>
        </Note>
      )}
      <div className="card stack">
        <h2>Atmosphere (optional)</h2>
        <p className="muted small">A quiet sound under the whole scene, such as rain, a busy market or a kitchen. It loops and fades out at the end.</p>
        <div className="row wrap">
          <input type="text" aria-label="Describe the atmosphere" placeholder="Soft rain on a window, distant thunder" value={project.bed.prompt} onChange={(e) => edit((p) => ({ ...p, bed: { ...p.bed, prompt: e.target.value } }))} style={{ flex: 1, minWidth: 220 }} />
          <select aria-label="Length of the loop" value={bedSecs} onChange={(e) => setBedSecs(Number(e.target.value))}>
            {[6, 12, 22].map((s) => (
              <option key={s} value={s}>
                {s}s loop
              </option>
            ))}
          </select>
          <button onClick={() => void makeBed()} disabled={busy || !project.bed.prompt.trim() || !keys.elevenlabs}>
            {project.bed.take ? "Make another" : "Make atmosphere"}
          </button>
        </div>
        {project.bed.take && (
          <div className="row wrap">
            <PlayButton label="Hear it" get={() => takeUrl(project.id, project.bed.take!.id)} />
            <label className="row small muted">
              Volume
              <input type="range" min={0} max={1} step={0.05} value={project.bed.volume} aria-label="Atmosphere volume" onChange={(e) => edit((p) => ({ ...p, bed: { ...p.bed, volume: Number(e.target.value) } }))} />
              <span className="num">{Math.round(project.bed.volume * 100)}%</span>
            </label>
            <button className="sm ghost" onClick={() => edit((p) => ({ ...p, bed: { ...p.bed, take: undefined } }))}>
              Remove
            </button>
          </div>
        )}
      </div>
      <div className="card stack">
        <h2>What to save</h2>
        {(
          [
            ["whole", "One file with the whole scene mixed"],
            ["scenes", "One file for each scene"],
            ["lines", "Every line as its own file, in a folder for each character"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="row">
            <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
          </label>
        ))}
        <p className="muted small num">
          {plan.items.filter((i) => i.kind === "speech").length} lines, about {fmtTime(plan.total)} long.
        </p>
        <div className="row">
          <button className="primary" disabled={busy || plan.items.length === 0 || !(opts.whole || opts.scenes || opts.lines)} onClick={() => void doExport()}>
            {busy ? "Exporting…" : "Export"}
          </button>
          <button
            onClick={() => {
              stopPlayback();
              void import("../preview").then((m) => m.previewScene(project, () => undefined)).catch((e: Error) => toast(e.message, true));
            }}
            disabled={plan.items.length === 0}
          >
            Listen first
          </button>
        </div>
      </div>
      {made.length > 0 && (
        <div className="card stack lit" aria-live="polite">
          <h2>Saved</h2>
          {made.map((p) => (
            <div key={p} className="row between small">
              <code style={{ wordBreak: "break-all" }}>{p}</code>
              <button className="sm" onClick={() => void reveal(p)}>
                Show in folder
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
