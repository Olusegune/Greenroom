import type { Line, MixCfg, MusicClip, Project } from "./types";

/**
 * What the Timeline screen can change: where lines start, their fades and level, the music, and the ducking settings.
 * Undo puts these back and nothing else, so it never throws away takes, text or voices made since.
 */
export interface Arrangement {
  lines: Record<string, { cue?: number; fadeIn?: number; fadeOut?: number; gain?: number }>;
  music: MusicClip[];
  mix?: Partial<MixCfg>;
}

export function snapshot(p: Pick<Project, "lines" | "music" | "mix">): Arrangement {
  const lines: Arrangement["lines"] = {};
  for (const l of p.lines) lines[l.id] = { cue: l.cue, fadeIn: l.fadeIn, fadeOut: l.fadeOut, gain: l.direction.gain };
  return { lines, music: structuredClone(p.music ?? []), mix: p.mix ? { ...p.mix } : undefined };
}

export function restore<P extends Pick<Project, "lines" | "music" | "mix">>(p: P, a: Arrangement): P {
  const lines = p.lines.map((l): Line => {
    const s = a.lines[l.id];
    if (!s) return l;
    const { cue: _c, fadeIn: _fi, fadeOut: _fo, ...rest } = l;
    void [_c, _fi, _fo];
    const direction = { ...l.direction };
    if (s.gain === undefined) delete direction.gain;
    else direction.gain = s.gain;
    return { ...rest, direction, ...(s.cue !== undefined ? { cue: s.cue } : {}), ...(s.fadeIn !== undefined ? { fadeIn: s.fadeIn } : {}), ...(s.fadeOut !== undefined ? { fadeOut: s.fadeOut } : {}) };
  });
  return { ...p, lines, music: structuredClone(a.music), mix: a.mix ? { ...a.mix } : undefined };
}

export function same(a: Arrangement, b: Arrangement): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const LIMIT = 100;
/** Changes with the same key this close together (a slider being dragged, a number being typed) count as one step. */
export const MERGE_MS = 900;

export class History {
  private past: Arrangement[] = [];
  private future: Arrangement[] = [];
  private lastKey = "";
  private lastAt = 0;

  /** Call with the arrangement as it is just before a change. */
  record(before: Arrangement, key: string, now: number): void {
    const merge = key !== "" && key === this.lastKey && now - this.lastAt < MERGE_MS && this.past.length > 0;
    this.lastKey = key;
    this.lastAt = now;
    if (merge) return;
    if (this.past.length > 0 && same(this.past[this.past.length - 1]!, before)) return;
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Returns the arrangement to go back to, given the one showing now. */
  undo(current: Arrangement): Arrangement | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    this.lastKey = "";
    return prev;
  }

  redo(current: Arrangement): Arrangement | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.lastKey = "";
    return next;
  }
}

const histories = new Map<string, History>();
/** One history per project, kept while the app is open, so leaving the Timeline and coming back does not lose it. */
export function historyFor(projectId: string): History {
  let h = histories.get(projectId);
  if (!h) histories.set(projectId, (h = new History()));
  return h;
}
