import { invoke } from "@tauri-apps/api/core";
import type { KeyName, Provider } from "./lab";

export interface Voice {
  id: string;
  name: string;
}
export interface ClipOut {
  audioB64: string;
  mime: string;
  ms: number;
}

// Outside the desktop app (a plain browser) there is no backend; say so rather than throw an obscure error.
const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp()) throw new Error("Open Greenroom as the Windows app to use this.");
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : "Something went wrong.");
  }
}

export const api = {
  keyStatus: () => (inApp() ? invoke<Record<KeyName, boolean>>("key_status") : Promise.resolve({ elevenlabs: false, kie: false })),
  setKey: (name: KeyName, value: string) => call<void>("set_key", { name, value }),
  clearKey: (name: KeyName) => call<void>("clear_key", { name }),
  voices: () => call<Voice[]>("eleven_voices"),
  runClip: (provider: Provider, text: string, voice?: string) => call<ClipOut>("run_clip", { req: { provider, text, voice } }),
  saveReport: (text: string) => call<string>("save_report", { text }),
};

export function toUrl(c: ClipOut): string {
  const bin = atob(c.audioB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: c.mime }));
}
