// Making one take: pick the engine from the voice, shape the text for it, save the audio, remember its length.

import { api, type Provider } from "./api";
import { applyPronunciations, composeText, stripTags, vkInstructions } from "./direct";
import { ENGINES, providerFor, type ElevenModel } from "./engines";
import { remember } from "./media";
import { uid } from "./script";
import type { Line, Pronunciation, Take, VoiceEntry } from "./types";

export type Model = ElevenModel;

/** What is sent for this line and voice. Engines without tags get the plain words, plus delivery in words where they take it. */
export function plan(line: Line, voice: VoiceEntry, model: Model, dict: Pronunciation[] = []): { provider: Provider; text: string; instructions?: string; model: Take["model"] } {
  const e = voice.provider;
  const provider = providerFor(e, model, voice.vkClone);
  if (ENGINES[e].tags) return { provider, text: applyPronunciations(composeText(line), dict), model };
  const instructions = e === "voicekiller" ? vkInstructions(line.direction.emotion, line.direction.speed, line.direction.note) : undefined;
  return { provider, text: applyPronunciations(stripTags(line.text), dict), instructions, model: e as Take["model"] };
}

export async function makeTake(projectId: string, line: Line, voice: VoiceEntry, model: Model, dict: Pronunciation[] = []): Promise<Take> {
  const p = plan(line, voice, model, dict);
  const out = await api.runClip({ provider: p.provider, text: p.text, voice: voice.id, speed: line.direction.speed, instructions: p.instructions });
  const id = "t-" + uid();
  const ext = out.mime === "audio/wav" ? "wav" : "mp3";
  await api.takeWrite(projectId, id, ext, out.audioB64);
  const seconds = await remember(id, out);
  return { id, at: new Date().toISOString(), model: p.model, ext, voiceId: voice.id, sent: p.instructions ? `${p.text}  (instructions: ${p.instructions})` : p.text, seconds };
}

/** A sound clip (laugh, sneeze, door) made by the sound-effects model, kept like any other take. */
export async function makeSound(projectId: string, prompt: string, seconds: number) {
  const out = await api.runClip({ provider: "eleven-sfx", text: prompt, seconds });
  const id = "s-" + uid();
  const ext = out.mime === "audio/wav" ? "wav" : "mp3";
  await api.takeWrite(projectId, id, ext, out.audioB64);
  const real = await remember(id, out);
  return { id, ext, seconds: real } as const;
}

export function modelLabel(m: Take["model"]): string {
  return m === "eleven_v4" ? "Eleven v4" : m === "eleven_v3" ? "Eleven v3" : m === "voicekiller" ? "VoiceKiller" : m === "kie" ? "Kie" : m === "piper" ? "Piper" : "Local";
}
