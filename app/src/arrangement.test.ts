import { describe, expect, it } from "vitest";
import { History, MERGE_MS, historyFor, restore, same, snapshot } from "./arrangement";
import { DEFAULT_DIRECTION, type Line } from "./types";

const line = (id: string, o: Partial<Line> = {}): Line => ({ id, characterId: "c", scene: 0, text: id, direction: { ...DEFAULT_DIRECTION }, takes: [], events: [], ...o });
const proj = (lines: Line[]) => ({ lines, music: [], mix: undefined as undefined | { duck: boolean } });
const music = { id: "m", name: "Theme", take: { id: "t", ext: "wav", seconds: 10 }, start: 1, gainDb: -6, fadeIn: 0, fadeOut: 1, trimIn: 0, length: 10, duck: true, source: "" };

describe("arrangement snapshots", () => {
  it("put back cues, fades, level, music and mix, and drop values that were not set", () => {
    const before = proj([line("a"), line("b", { cue: 3, fadeIn: 0.2, direction: { ...DEFAULT_DIRECTION, gain: 2 } })]);
    const snap = snapshot(before);
    const after = { ...before, lines: [line("a", { cue: 5, fadeOut: 1, direction: { ...DEFAULT_DIRECTION, gain: -3 } }), line("b")], music: [music], mix: { duck: false } };
    const back = restore(after, snap);
    expect(back.lines[0]).not.toHaveProperty("cue");
    expect(back.lines[0]).not.toHaveProperty("fadeOut");
    expect(back.lines[0]!.direction.gain).toBeUndefined();
    expect(back.lines[1]).toMatchObject({ cue: 3, fadeIn: 0.2 });
    expect(back.lines[1]!.direction.gain).toBe(2);
    expect(back.music).toEqual([]);
    expect(back.mix).toBeUndefined();
  });

  it("leave takes, text, new lines and other direction alone", () => {
    const snap = snapshot(proj([line("a", { cue: 1 })]));
    const now = proj([line("a", { cue: 9, text: "edited", takes: [{ id: "t" } as never], direction: { ...DEFAULT_DIRECTION, emotion: "sad", gain: 4 } }), line("new")]);
    const back = restore(now, snap);
    expect(back.lines[0]).toMatchObject({ cue: 1, text: "edited", direction: { emotion: "sad" } });
    expect(back.lines[0]!.takes).toHaveLength(1);
    expect(back.lines[1]!.id).toBe("new");
  });

  it("copy rather than share, so later edits cannot change a saved step", () => {
    const p = { ...proj([line("a")]), music: [{ ...music }] };
    const snap = snapshot(p);
    p.music[0]!.start = 99;
    expect(snap.music[0]!.start).toBe(1);
    expect(same(snap, snapshot(p))).toBe(false);
  });
});

describe("history", () => {
  const a = (cue: number) => snapshot(proj([line("a", { cue })]));
  it("steps back and forward, and a new change drops the steps ahead", () => {
    const h = new History();
    h.record(a(0), "move", 0);
    h.record(a(1), "move2", 5000);
    expect(h.canUndo()).toBe(true);
    expect(h.undo(a(2))).toEqual(a(1));
    expect(h.undo(a(1))).toEqual(a(0));
    expect(h.undo(a(0))).toBeNull();
    expect(h.canRedo()).toBe(true);
    expect(h.redo(a(0))).toEqual(a(1));
    h.record(a(1), "x", 9000);
    expect(h.canRedo()).toBe(false);
  });

  it("counts a quick run of the same kind of change as one step", () => {
    const h = new History();
    h.record(a(0), "level:a", 1000);
    h.record(a(1), "level:a", 1000 + MERGE_MS - 1);
    h.record(a(2), "level:a", 1000 + 2 * MERGE_MS - 2);
    expect(h.undo(a(3))).toEqual(a(0));
    expect(h.undo(a(0))).toBeNull();
    const g = new History();
    g.record(a(0), "level:a", 0);
    g.record(a(1), "level:a", MERGE_MS + 10);
    expect(g.undo(a(2))).toEqual(a(1));
  });

  it("does not record a step that changed nothing, and keeps one history per project", () => {
    const h = new History();
    h.record(a(0), "", 0);
    h.record(a(0), "", 5000);
    expect(h.undo(a(1))).toEqual(a(0));
    expect(h.undo(a(0))).toBeNull();
    expect(historyFor("p1")).toBe(historyFor("p1"));
    expect(historyFor("p1")).not.toBe(historyFor("p2"));
  });
});
