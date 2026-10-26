import type { Engine } from "./engines";

export interface Character {
  id: string;
  name: string;
  voiceId?: string;
  /** Free label such as "English", "Yoruba" or "Taglish": a reminder and a voice-search filter, not a switch sent to the model. */
  language: string;
}

export interface Take {
  id: string;
  at: string;
  model: "eleven_v4" | "eleven_v3" | "voicekiller" | "kie" | "piper" | "local";
  ext: "mp3" | "wav";
  voiceId: string;
  /** Exactly what was sent, tags included, so a take can always be explained. */
  sent: string;
  seconds: number;
}

export interface SoundEvent {
  id: string;
  prompt: string;
  placement: "before" | "after";
  seconds: number;
  take?: { id: string; ext: "mp3" | "wav"; seconds: number };
}

export interface Direction {
  emotion: string;
  /** The director's note in plain words, such as "tired, as if lifting something heavy". */
  note: string;
  sounds: string[];
  speed: number;
  pauseAfter: number;
}

export interface Line {
  id: string;
  characterId: string;
  scene: number;
  text: string;
  direction: Direction;
  takes: Take[];
  chosen?: string;
  events: SoundEvent[];
}

export interface Pronunciation {
  from: string;
  to: string;
}

export interface Bed {
  prompt: string;
  volume: number;
  take?: { id: string; ext: "mp3" | "wav"; seconds: number };
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  script: string;
  scenes: string[];
  characters: Character[];
  lines: Line[];
  bed: Bed;
  gap: number;
  /** Written form to spoken form, applied to the words sent to a voice, never to the script itself. */
  pronunciations: Pronunciation[];
  createdAt: string;
  updatedAt: string;
}

export interface VoiceEntry {
  /** The voice id: an ElevenLabs or Kie id, a VoiceKiller or local-server voice name, or a Piper voice key. */
  id: string;
  name: string;
  provider: Engine;
  /** A voice cloned on voicekiller.com uses their clone endpoint. */
  vkClone?: boolean;
  source: "designed" | "cloned" | "library" | "account";
  language: string;
  accent: string;
  gender: string;
  notes: string;
  previewUrl?: string;
  createdAt: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  owner?: string | null;
  accent: string;
  language: string;
  gender: string;
  description: string;
  category: string;
  previewUrl?: string | null;
}

export const DEFAULT_DIRECTION: Direction = { emotion: "", note: "", sounds: [], speed: 1, pauseAfter: 0.4 };

export function newProject(id: string, name: string, now: string): Project {
  return { version: 1, id, name, script: "", scenes: ["Scene 1"], characters: [], lines: [], bed: { prompt: "", volume: 0.25 }, gap: 0.4, pronunciations: [], createdAt: now, updatedAt: now };
}
