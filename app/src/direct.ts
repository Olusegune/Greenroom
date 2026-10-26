import type { Direction, Line } from "./types";

// Delivery and body sounds are written into the text as [tags], which is how Eleven v3 and v4 take direction.
// Owner listening (2026-10-26): laugh, sigh, crying, whisper, gasp, cough and out-of-breath all sounded right on v4.
// The rest are unverified until heard; the UI marks them.

export interface Choice {
  tag: string;
  label: string;
  verified: boolean;
}

export const EMOTIONS: Choice[] = [
  { tag: "excited", label: "Excited", verified: false },
  { tag: "happy", label: "Happy", verified: false },
  { tag: "sad", label: "Sad", verified: false },
  { tag: "angry", label: "Angry", verified: false },
  { tag: "annoyed", label: "Annoyed", verified: false },
  { tag: "scared", label: "Scared", verified: false },
  { tag: "nervous", label: "Nervous", verified: false },
  { tag: "tender", label: "Tender", verified: false },
  { tag: "sarcastic", label: "Sarcastic", verified: false },
  { tag: "tired", label: "Tired", verified: false },
  { tag: "whispers", label: "Whisper", verified: true },
  { tag: "shouting", label: "Shouting", verified: false },
];

export const SOUNDS: Choice[] = [
  { tag: "laughs", label: "Laugh", verified: true },
  { tag: "sighs", label: "Sigh", verified: true },
  { tag: "crying", label: "Crying", verified: true },
  { tag: "gasps", label: "Gasp", verified: true },
  { tag: "coughs", label: "Cough", verified: true },
  { tag: "out of breath", label: "Out of breath", verified: true },
  { tag: "giggles", label: "Giggle", verified: false },
  { tag: "chuckles", label: "Chuckle", verified: false },
  { tag: "clears throat", label: "Clear throat", verified: false },
  { tag: "sniffles", label: "Sniffle", verified: false },
  { tag: "groans", label: "Groan", verified: false },
  { tag: "exhales", label: "Exhale", verified: false },
  { tag: "gulps", label: "Gulp", verified: false },
  { tag: "yawns", label: "Yawn", verified: false },
];

const tag = (t: string) => `[${t}]`;

/** What is sent to the voice model: chosen emotion and sounds first, then the line, skipping tags already written inline. */
export function composeText(line: Pick<Line, "text" | "direction">): string {
  const d: Direction = line.direction;
  const have = (t: string) => line.text.toLowerCase().includes(tag(t));
  const lead = [d.emotion, ...d.sounds].map((t) => t.trim().toLowerCase()).filter((t) => t && !have(t)).map(tag);
  return [...lead, line.text.trim()].join(" ").trim();
}

export function countChars(lines: Pick<Line, "text" | "direction">[]): number {
  return lines.reduce((n, l) => n + composeText(l).length, 0);
}

export function toggleIn(list: string[], t: string): string[] {
  return list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
}

export function chosenTake(line: Line) {
  return line.takes.find((t) => t.id === line.chosen) ?? line.takes[line.takes.length - 1];
}

// ---- VoiceKiller has no inline sound tags: delivery and pace travel as an `instructions` sentence. ----

const VK_STYLE: Record<string, string> = {
  whispers: "whispering softly",
  shouting: "loud, as if shouting",
  excited: "excited and energetic",
  happy: "warm and happy",
  sad: "sad and subdued",
  angry: "angry",
  annoyed: "annoyed",
  scared: "frightened",
  nervous: "nervous",
  tender: "tender and gentle",
  tired: "tired and low on energy",
  sarcastic: "sarcastic",
};

export function vkInstructions(emotion: string, speed: number): string | undefined {
  const parts: string[] = [];
  const e = emotion.trim().toLowerCase();
  const phrase = VK_STYLE[e];
  if (phrase) parts.push(`Speak in a tone that is ${phrase}.`);
  else if (e) parts.push(`Speak in a tone that is ${e.replace(/[^\p{L} -]/gu, "").slice(0, 40)}.`);
  if (speed >= 1.15) parts.push("Speak faster than normal.");
  else if (speed <= 0.85) parts.push("Speak slower than normal.");
  return parts.length ? parts.join(" ") : undefined;
}

/** The words only: VoiceKiller would read a [tag] aloud. */
export function stripTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Sounds this line asks for that VoiceKiller cannot make, so the owner is told before paying. */
export function vkUnsupported(line: Pick<Line, "text" | "direction">): string[] {
  const inline = [...line.text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.toLowerCase());
  return [...new Set([...line.direction.sounds, ...inline.filter((t) => SOUNDS.some((s) => s.tag === t))])];
}
