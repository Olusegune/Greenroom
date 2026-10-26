// Demo backend, used only when Greenroom is opened in a plain browser (never inside the Windows app).
// It makes short tones instead of calling any provider, so every screen can be viewed and tested for free.

import { encodeWav, toBase64 } from "./audio";
import type { Project, VoiceEntry, VoiceInfo } from "./types";
import type { Api, ClipReq, KeyName, PiperVoice, VideoInfo } from "./api";
import type { EnginesCfg } from "./engines";

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const keys = { elevenlabs: true, kie: true, voicekiller: true } as Record<string, boolean>;
const projects = new Map<string, Project>();
const takes = new Map<string, { audioB64: string; mime: string }>();
let library: VoiceEntry[] = [];
let engines: Partial<EnginesCfg> = {};
let piperInstalled = false;
let ffmpegInstalled = false;
const piperVoices = new Set<string>();
const PIPER: PiperVoice[] = [
  { key: "en_GB-alba-medium", name: "alba", code: "en_GB", family: "en", language: "English", country: "Great Britain", quality: "medium", speakers: 1, sizeMb: 60.3 },
  { key: "en_US-lessac-medium", name: "lessac", code: "en_US", family: "en", language: "English", country: "United States", quality: "medium", speakers: 1, sizeMb: 60.3 },
  { key: "fr_FR-siwis-medium", name: "siwis", code: "fr_FR", family: "fr", language: "French", country: "France", quality: "medium", speakers: 1, sizeMb: 60.3 },
  { key: "sw_CD-lanfrica-medium", name: "lanfrica", code: "sw_CD", family: "sw", language: "Swahili", country: "Congo", quality: "medium", speakers: 1, sizeMb: 60.3 },
];

function tone(seconds: number, hz: number): string {
  const rate = 22050;
  const n = Math.floor(seconds * rate);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * hz * i) / rate) * 0.2 * Math.min(1, i / 800, (n - i) / 800);
  return toBase64(encodeWav([d], rate));
}

const MINE: VoiceInfo[] = [
  { id: "demo-ada", name: "Ada (demo)", accent: "nigerian", language: "en", gender: "female", description: "warm, confident", category: "cloned", previewUrl: null },
  { id: "demo-tunde", name: "Tunde (demo)", accent: "nigerian", language: "en", gender: "male", description: "easygoing, young", category: "designed", previewUrl: null },
];
const SHARED: VoiceInfo[] = [
  { id: "sh1", owner: "own1", name: "Chidi", accent: "nigerian", language: "en", gender: "male", description: "calm, narration", category: "professional", previewUrl: null },
  { id: "sh2", owner: "own2", name: "Amara", accent: "nigerian", language: "yo", gender: "female", description: "bright, conversational", category: "professional", previewUrl: null },
  { id: "sh3", owner: "own3", name: "Min-jun", accent: "korean", language: "ko", gender: "male", description: "deep, dramatic", category: "professional", previewUrl: null },
];

export const mock: Api = {
  keyStatus: async () => ({ elevenlabs: keys.elevenlabs!, kie: keys.kie!, voicekiller: keys.voicekiller! }),
  setKey: async (n: KeyName) => void (keys[n === "voicekiller-userid" ? "voicekiller" : n] = true),
  clearKey: async (n: KeyName) => void (keys[n === "voicekiller-userid" ? "voicekiller" : n] = false),
  runClip: async (req: ClipReq) => {
    await wait(400);
    const secs = req.provider.endsWith("sfx") ? (req.seconds ?? 2) : Math.min(8, 1 + req.text.length / 22);
    return { audioB64: tone(secs, 180 + (req.text.length % 7) * 40), mime: "audio/wav", ms: 400 };
  },
  voicesMine: async () => (await wait(), MINE),
  voicesVoiceKiller: async () => (await wait(), [{ name: "Bella", language: "en" }, { name: "Lucia (es-MX)", language: "es-MX" }, { name: "Authoritative Advisor 1 (en-GB)", language: "en-GB" }]),
  voicesShared: async (search, language, accent) => {
    await wait();
    const l = SHARED.filter((v) => (!search || v.name.toLowerCase().includes(search.toLowerCase())) && (!language || v.language === language) && (!accent || v.accent === accent));
    return { voices: l, more: false };
  },
  voiceAddShared: async (_o, v) => (await wait(), "added-" + v),
  voiceDesign: async () => (await wait(700), [1, 2, 3].map((i) => ({ generatedVoiceId: "gen" + i, audioB64: tone(2.5, 150 + i * 60), seconds: 2.5 }))),
  voiceDesignSave: async (g) => (await wait(), "designed-" + g),
  voiceClone: async (name, _f, _m, _a, permission) => {
    if (!permission) throw new Error("Confirm that you have permission to clone this voice first.");
    await wait(600);
    return "cloned-" + name.toLowerCase().replace(/\W+/g, "");
  },
  voiceDelete: async () => void (await wait()),
  previewFetch: async () => ({ audioB64: tone(1.6, 330), mime: "audio/wav" }),
  projectList: async () => [...projects.values()].map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  projectLoad: async (id) => {
    const p = projects.get(id);
    if (!p) throw new Error("Could not open that project.");
    return structuredClone(p);
  },
  projectSave: async (p) => void projects.set(p.id, structuredClone(p)),
  takeWrite: async (_p, take, ext, audioB64) => void takes.set(take, { audioB64, mime: ext === "mp3" ? "audio/mpeg" : "audio/wav" }),
  takeRead: async (_p, take) => {
    const t = takes.get(take);
    if (!t) throw new Error("That take is missing from the project folder.");
    return t;
  },
  exportWrite: async (_p, folder, filename) => `C:\\Users\\you\\Documents\\Greenroom\\projects\\demo\\exports\\${folder ? folder + "\\" : ""}${filename}`,
  libraryLoad: async () => structuredClone(library),
  librarySave: async (v) => void (library = structuredClone(v)),
  enginesLoad: async () => structuredClone(engines),
  enginesSave: async (c) => void (engines = structuredClone(c)),
  piperStatus: async () => ({ installed: piperInstalled, voices: [...piperVoices] }),
  piperInstall: async () => (await wait(900), void (piperInstalled = true)),
  piperCatalog: async () => (await wait(), PIPER),
  piperInstallVoice: async (k) => (await wait(900), void piperVoices.add(k)),
  piperRemoveVoice: async (k) => void piperVoices.delete(k),
  localVoices: async () => (await wait(), ["af_bella", "am_adam"]),
  directorComplete: async (_s: string, user: string) => {
    await wait(700);
    const ids = [...user.matchAll(/^(l-[\w-]+) \|/gm)].map((x) => x[1]!);
    const lines = ids.map((id, i) => ({ id, emotion: i % 3 === 0 ? "annoyed" : "", sounds: i % 3 === 1 ? ["sighs"] : i % 4 === 2 ? ["laughs"] : [], note: i % 2 === 0 ? "a little tired, as if carrying a heavy box" : "", speed: 1, pauseAfter: 0.5 }));
    return ["Here you go:", "```json", JSON.stringify({ lines, atmosphere: "a busy kitchen, soft pots and pans" }), "```"].join("\n");
  },
  pickAudio: async () => "C:/Demo/Theme Music.wav",
  audioImport: async (_p: string, path: string) => {
    await wait(300);
    const id = "m-demo" + takes.size;
    takes.set(id, { audioB64: tone(24, 220), mime: "audio/wav" });
    return { id, ext: "wav", name: path.split(/[\/]/).pop() ?? "music.wav", bytes: 24 * 22050 * 2 + 44, sha256: "d".repeat(64) };
  },
  ffmpegStatus: async () => ({ installed: ffmpegInstalled, source: ffmpegInstalled ? ("greenroom" as const) : null }),
  ffmpegInstall: async () => (await wait(900), void (ffmpegInstalled = true)),
  videoMux: async (_p: string, video: string, _m: string, _k: boolean) => {
    await wait(700);
    const stem = (video.split(/[\/]/).pop() ?? "video").replace(/\.[^.]+$/, "");
    return { path: ["C:", "Users", "you", "Documents", "Greenroom", "projects", "demo", "exports", "Video", stem + " with Greenroom mix.mp4"].join("\\"), codec: "AAC 320 kbps" };
  },
  videoProbe: async (path: string): Promise<VideoInfo> => ({ container: path.split(".").pop() ?? "mp4", known: false, fpsNum: 0, fpsDen: 0, durationSec: 0, width: 0, height: 0 }),
  videoAllow: async () => undefined,
  pickVideo: async () => "C:/Demo/Rough Cut.webm",
  saveReport: async () => "C:\\Users\\you\\Documents\\Greenroom\\listening-report.md",
};
