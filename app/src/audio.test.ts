import { describe, expect, it } from "vitest";
import { encodeWav, fmtTime, fromBase64, lineFileName, planTimeline, toBase64 } from "./audio";
import { DEFAULT_DIRECTION, type Line } from "./types";

const take = (id: string, seconds: number) => ({ id, at: "", model: "eleven_v4" as const, ext: "mp3" as const, voiceId: "v", sent: "", seconds });
const line = (id: string, scene: number, seconds: number | null, extra: Partial<Line> = {}): Line => ({
  id,
  characterId: "c",
  scene,
  text: "x",
  direction: { ...DEFAULT_DIRECTION, pauseAfter: 0.5 },
  takes: seconds === null ? [] : [take("t" + id, seconds)],
  events: [],
  ...extra,
});
const bed = { prompt: "", volume: 0.2 };

describe("planTimeline", () => {
  it("places speech one after another with each line's pause", () => {
    const p = planTimeline({ lines: [line("a", 0, 2), line("b", 0, 1)], gap: 0.4, bed });
    expect(p.items.map((i) => [i.lineId, i.start])).toEqual([["a", 0], ["b", 2.5]]);
    expect(p.total).toBe(4);
  });
  it("puts sound events before and after the speech", () => {
    const ev = (placement: "before" | "after", s: number) => ({ id: "e" + placement, prompt: "", placement, seconds: s, take: { id: "x" + placement, ext: "mp3" as const, seconds: s } });
    const p = planTimeline({ lines: [line("a", 0, 2, { events: [ev("before", 1), ev("after", 0.5)] })], gap: 0, bed });
    expect(p.items.map((i) => [i.kind, i.start])).toEqual([["event", 0], ["speech", 1], ["event", 3]]);
    expect(p.total).toBe(4);
  });
  it("skips lines with no take and reports them", () => {
    const p = planTimeline({ lines: [line("a", 0, null), line("b", 0, 1)], gap: 0, bed });
    expect(p.missing).toEqual(["a"]);
    expect(p.items).toHaveLength(1);
  });
  it("can plan one scene, and lays the bed under all of it", () => {
    const withBed = { prompt: "rain", volume: 0.3, take: { id: "bed", ext: "mp3" as const, seconds: 10 } };
    const p = planTimeline({ lines: [line("a", 0, 1), line("b", 1, 2)], gap: 0, bed: withBed }, 1);
    expect(p.items.map((i) => i.kind)).toEqual(["bed", "speech"]);
    expect(p.items[0]).toMatchObject({ start: 0, seconds: 2.5 });
  });
});

describe("encodeWav", () => {
  it("writes a valid 16-bit PCM header and clamps samples", () => {
    const buf = encodeWav([new Float32Array([0, 1, -1, 2])], 8000);
    const v = new DataView(buf);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint32(40, true)).toBe(8);
    expect(buf.byteLength).toBe(44 + 8);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(32767);
  });
  it("interleaves stereo", () => {
    const v = new DataView(encodeWav([new Float32Array([1]), new Float32Array([-1])], 44100));
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
});

describe("helpers", () => {
  it("round-trips base64", () => {
    const b = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...fromBase64(toBase64(b.buffer))]).toEqual([...b]);
  });
  it("formats time and file names", () => {
    expect(fmtTime(75.4)).toBe("1:15");
    expect(lineFileName(2, "Ada: <Mum>", "mp3")).toBe("03 - Ada Mum.mp3");
    expect(lineFileName(0, "???", "wav")).toBe("01 - Line.wav");
  });
});
