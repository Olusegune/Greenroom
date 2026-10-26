// Timeline planning and WAV writing. The planning and the encoder are pure so they can be tested; the browser audio
// calls (decoding, offline rendering) are kept thin at the bottom.

import { chosenTake } from "./direct";
import type { Line, Project } from "./types";

export interface Placed {
  kind: "speech" | "event" | "bed";
  lineId?: string;
  ref: { id: string; ext: "mp3" | "wav" };
  start: number;
  seconds: number;
}

export interface Plan {
  items: Placed[];
  total: number;
  /** Line ids that have no chosen take and were left out. */
  missing: string[];
}

/** Lays the scene out in order: sound before, speech, sound after, then the line's pause (or the project gap). */
export function planTimeline(p: Pick<Project, "lines" | "gap" | "bed">, sceneIndex?: number): Plan {
  const items: Placed[] = [];
  const missing: string[] = [];
  let t = 0;
  for (const line of p.lines) {
    if (sceneIndex !== undefined && line.scene !== sceneIndex) continue;
    const take = chosenTake(line);
    if (!take) {
      missing.push(line.id);
      continue;
    }
    for (const e of line.events.filter((x) => x.placement === "before" && x.take)) {
      items.push({ kind: "event", lineId: line.id, ref: e.take!, start: t, seconds: e.take!.seconds });
      t += e.take!.seconds;
    }
    items.push({ kind: "speech", lineId: line.id, ref: { id: take.id, ext: take.ext }, start: t, seconds: take.seconds });
    t += take.seconds;
    for (const e of line.events.filter((x) => x.placement === "after" && x.take)) {
      items.push({ kind: "event", lineId: line.id, ref: e.take!, start: t, seconds: e.take!.seconds });
      t += e.take!.seconds;
    }
    t += Number.isFinite(line.direction.pauseAfter) ? Math.max(0, line.direction.pauseAfter) : p.gap;
  }
  if (p.bed.take && t > 0) items.unshift({ kind: "bed", ref: p.bed.take, start: 0, seconds: t });
  return { items, total: t, missing };
}

export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length || 1;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function lineFileName(index: number, characterName: string, ext: string): string {
  return `${String(index + 1).padStart(2, "0")} - ${characterName.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Line"}.${ext}`;
}

export type Loader = (ref: { id: string; ext: "mp3" | "wav" }) => Promise<AudioBuffer>;

/** Mixes the plan into one stereo buffer. The bed loops under everything at its volume. */
export async function renderPlan(plan: Plan, bedVolume: number, load: Loader, sampleRate = 44100): Promise<Float32Array[]> {
  const length = Math.max(1, Math.ceil(plan.total * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  for (const it of plan.items) {
    const src = ctx.createBufferSource();
    src.buffer = await load(it.ref);
    const gain = ctx.createGain();
    gain.gain.value = it.kind === "bed" ? bedVolume : 1;
    if (it.kind === "bed") {
      src.loop = true;
      gain.gain.setValueAtTime(bedVolume, 0);
      gain.gain.setValueAtTime(bedVolume, Math.max(0, it.seconds - 1.2));
      gain.gain.linearRampToValueAtTime(0, it.seconds);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(it.start);
    if (it.kind === "bed") src.stop(it.seconds);
  }
  const out = await ctx.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}

export function sceneLines(lines: Line[], scene: number): Line[] {
  return lines.filter((l) => l.scene === scene);
}
