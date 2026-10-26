// Making one take: pick the provider from the voice, shape the text for it, save the audio, remember its length.

import { api, type Provider } from "./api";
import { composeText, stripTags, vkInstructions } from "./direct";
import { remember } from "./media";
import { uid } from "./script";
import type { Line, Take, VoiceEntry } from "./types";

export type Model = "eleven_v4" | "eleven_v3";

export function plan(line: Line, voice: VoiceEntry, model: Model) {
  if (voice.provider === "voicekiller") {
    return { provider: (voice.vkClone ? "voicekiller-clone" : "voicekiller") as Provider, text: stripTags(line.text), instructions: vkInstructions(line.direction.emotion, line.direction.speed), model: "voicekiller" as const };
  }
  return { provider: (model === "eleven_v4" ? "eleven-v4" : "eleven-tts") as Provider, text: composeText(line), instructions: undefined, model };
}

export async function makeTake(projectId: string, line: Line, voice: VoiceEntry, model: Model): Promise<Take> {
  const p = plan(line, voice, model);
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
