import { describe, expect, it } from "vitest";
import { encodeWav, fmtTime, fromBase64, lineFileName, planTimeline, stemSets, textBase64, toBase64 } from "./audio";
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

/** Walks the RIFF chunks so tests can check what was written. */
function chunks(buf: ArrayBuffer): Record<string, { at: number; size: number }> {
  const v = new DataView(buf);
  const out: Record<string, { at: number; size: number }> = {};
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const size = v.getUint32(o + 4, true);
    out[id] = { at: o + 8, size };
    o += 8 + size + (size % 2);
  }
  return out;
}

describe("pro WAV writer", () => {
  const tone = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
  it("writes 24-bit PCM with exact sizes and values", () => {
    const buf = encodeWav([tone, tone], 48000, { bits: 24 });
    const v = new DataView(buf);
    const c = chunks(buf);
    expect(v.getUint16(c["fmt "]!.at, true)).toBe(1);
    expect(v.getUint16(c["fmt "]!.at + 2, true)).toBe(2);
    expect(v.getUint32(c["fmt "]!.at + 4, true)).toBe(48000);
    expect(v.getUint16(c["fmt "]!.at + 12, true)).toBe(6);
    expect(v.getUint16(c["fmt "]!.at + 14, true)).toBe(24);
    expect(c["data"]!.size).toBe(6 * 2 * 3);
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    const d = c["data"]!.at;
    const s24 = (i: number) => { const x = v.getUint8(d + i) | (v.getUint8(d + i + 1) << 8) | (v.getUint8(d + i + 2) << 16); return x & 0x800000 ? x - 0x1000000 : x; };
    expect(s24(6)).toBe(Math.round(0.5 * 0x7fffff));
    expect(s24(12)).toBe(-Math.round(0.5 * 0x800000));
    expect(s24(18)).toBe(0x7fffff);
    expect(s24(24)).toBe(-0x800000);
    expect(s24(30)).toBe(0x7fffff);
  });
  it("writes 32-bit float with a fact chunk and exact samples", () => {
    const buf = encodeWav([tone], 96000, { bits: 32 });
    const v = new DataView(buf);
    const c = chunks(buf);
    expect(v.getUint16(c["fmt "]!.at, true)).toBe(3);
    expect(v.getUint32(c["fact"]!.at, true)).toBe(6);
    expect(v.getFloat32(c["data"]!.at + 4 * 5, true)).toBe(2);
  });
  it("dithers 16-bit only when asked, and never changes the length", () => {
    const quiet = new Float32Array(2000).fill(0.0001);
    const plain = new DataView(encodeWav([quiet], 48000, { bits: 16 }));
    const dith = new DataView(encodeWav([quiet], 48000, { bits: 16, dither: true }));
    const values = new Set<number>();
    for (let i = 0; i < 2000; i++) { values.add(dith.getInt16(44 + i * 2, true)); expect(plain.getInt16(44 + i * 2, true)).toBe(3); }
    expect(values.size).toBeGreaterThan(1);
    expect(dith.byteLength).toBe(plain.byteLength);
  });
  it("embeds labelled cue markers that line up with the audio", () => {
    const buf = encodeWav([new Float32Array(48000 * 3)], 48000, { bits: 24, markers: [{ sec: 0.5, name: "01 ADA" }, { sec: 2, name: "02 TUNDE" }] });
    const v = new DataView(buf);
    const c = chunks(buf);
    expect(v.getUint32(c["cue "]!.at, true)).toBe(2);
    expect(v.getUint32(c["cue "]!.at + 4 + 4, true)).toBe(24000);
    expect(v.getUint32(c["cue "]!.at + 4 + 24 + 4, true)).toBe(96000);
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    const list = c["LIST"]!.at;
    expect(String.fromCharCode(v.getUint8(list), v.getUint8(list + 1), v.getUint8(list + 2), v.getUint8(list + 3))).toBe("adtl");
    const first = list + 4;
    expect(String.fromCharCode(v.getUint8(first), v.getUint8(first + 1), v.getUint8(first + 2), v.getUint8(first + 3))).toBe("labl");
    expect(new TextDecoder().decode(new Uint8Array(buf, first + 12, 6))).toBe("01 ADA");
  });
  it("adds a Broadcast Wave header when a description is given", () => {
    const buf = encodeWav([new Float32Array(10)], 48000, { bits: 24, description: "Late Delivery", originator: "Greenroom" });
    const v = new DataView(buf);
    const c = chunks(buf);
    expect(c["bext"]!.size).toBe(602);
    expect(new TextDecoder().decode(new Uint8Array(buf, c["bext"]!.at, 13))).toBe("Late Delivery");
    expect(new TextDecoder().decode(new Uint8Array(buf, c["bext"]!.at + 256, 9))).toBe("Greenroom");
    expect(v.getUint16(c["bext"]!.at + 346, true)).toBe(1);
    expect(c["data"]).toBeTruthy();
  });
  it("leaves the plain 16-bit file exactly as before when no options are given", () => {
    const buf = encodeWav([new Float32Array(4)], 8000);
    expect(buf.byteLength).toBe(44 + 8);
    expect(Object.keys(chunks(buf))).toEqual(["fmt ", "data"]);
  });
  it("round-trips text as base64", () => {
    expect(new TextDecoder().decode(fromBase64(textBase64("서연 Hello")))).toBe("서연 Hello");
  });
});

describe("level and stems", () => {
  const withGain = (id: string, ch: string, gain: number): Line => ({ ...line(id, 0, 1), characterId: ch, direction: { ...DEFAULT_DIRECTION, pauseAfter: 0, gain } });
  it("carries each line level into the plan and records where every spoken line sits", () => {
    const p = planTimeline({ lines: [withGain("a", "c1", -6), withGain("b", "c2", 3), line("c", 0, 1)], gap: 0, bed });
    expect(p.items.map((i) => i.gainDb)).toEqual([-6, 3, 0]);
    expect(p.spans).toEqual([{ lineId: "a", start: 0, end: 1 }, { lineId: "b", start: 1, end: 2 }, { lineId: "c", start: 2, end: 3 }]);
  });
  it("splits a mix into stems that partition every item exactly once", () => {
    const ev = { id: "e", prompt: "", placement: "after" as const, seconds: 0.5, take: { id: "x", ext: "mp3" as const, seconds: 0.5 } };
    const withBed = { prompt: "rain", volume: 0.3, take: { id: "bed", ext: "mp3" as const, seconds: 5 } };
    const lines = [{ ...withGain("a", "c1", 0), events: [ev] }, withGain("b", "c2", 0)];
    const p = planTimeline({ lines, gap: 0, bed: withBed });
    const stems = stemSets(p, [{ id: "c1", name: "ADA" }, { id: "c2", name: "TUNDE" }, { id: "c3", name: "NOBODY" }]);
    expect(stems.map((s) => s.name)).toEqual(["ADA", "TUNDE", "Sound clips", "Atmosphere"]);
    for (const it of p.items) expect(stems.filter((s) => s.filter(it))).toHaveLength(1);
  });
  it("has no sound-clip or atmosphere stem when there are none", () => {
    const p = planTimeline({ lines: [withGain("a", "c1", 0)], gap: 0, bed });
    expect(stemSets(p, [{ id: "c1", name: "ADA" }]).map((s) => s.name)).toEqual(["ADA"]);
  });
});
