import { describe, expect, it } from "vitest";
import { planTimeline } from "./audio";
import { audacityLabels, buildMarkers, cueSheetCsv, fileUrl, otioTimeline, timecode } from "./markers";
import { DEFAULT_DIRECTION, newProject, type Line, type Project } from "./types";

const take = (id: string, seconds: number) => ({ id, at: "", model: "eleven_v4" as const, ext: "mp3" as const, voiceId: "voiceX", sent: "[sighs] hi, \"you\"", seconds });

function project(): Project {
  const p = newProject("p1", "Late Delivery", "2026-10-26");
  p.scenes = ["Scene 1", "Scene 2"];
  p.characters = [{ id: "c1", name: "ADA", language: "English" }, { id: "c2", name: "TUNDE", language: "English" }];
  const mk = (id: string, ch: string, scene: number, secs: number, extra: Partial<Line> = {}): Line => ({ id, characterId: ch, scene, text: "Hello, world", direction: { ...DEFAULT_DIRECTION, pauseAfter: 0.5, gain: -3, emotion: "sad", sounds: ["sighs"] }, takes: [take("t" + id, secs)], events: [], ...extra });
  p.lines = [
    mk("a", "c1", 0, 2, { events: [{ id: "e1", prompt: "door", placement: "after", seconds: 1, take: { id: "s1", ext: "mp3", seconds: 1 } }] }),
    mk("b", "c2", 0, 1),
    { ...mk("c", "c1", 1, 1), takes: [] },
  ];
  p.bed = { prompt: "rain", volume: 0.3, take: { id: "bed1", ext: "mp3", seconds: 4 } };
  return p;
}

describe("timecode", () => {
  it("counts hours, minutes, seconds and frames", () => {
    expect(timecode(0, 24)).toBe("00:00:00:00");
    expect(timecode(3661.5, 24)).toBe("01:01:01:12");
    expect(timecode(59.999, 25)).toBe("00:00:59:24");
    expect(timecode(-5, 30)).toBe("00:00:00:00");
    expect(timecode(1, 24)).toBe("00:00:01:00");
  });
});

describe("markers and label track", () => {
  it("number lines the way file names do, and skip lines with no take", () => {
    const p = project();
    const m = buildMarkers(p, planTimeline(p));
    expect(m.map((x) => [x.name, x.sec, x.endSec])).toEqual([["01 ADA", 0, 2], ["02 TUNDE", 3.5, 4.5]]);
  });
  it("writes an Audacity label track", () => {
    const p = project();
    expect(audacityLabels(buildMarkers(p, planTimeline(p)))).toBe("0.000000\t2.000000\t01 ADA\n3.500000\t4.500000\t02 TUNDE\n");
  });
});

describe("cue sheet", () => {
  it("lists each spoken line with timing and provenance, and escapes commas and quotes", () => {
    const p = project();
    const csv = cueSheetCsv(p, planTimeline(p), 24);
    expect(csv.startsWith("\uFEFFLine,Scene,Character")).toBe(true);
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain('1,Scene 1,ADA,00:00:00:00,00:00:02:00,0.000,2.000,2.000,"Hello, world",sad; sighs,-3.0,voiceX,eleven_v4,ta,"[sighs] hi, ""you"""');
    expect(rows[2]).toContain("2,Scene 1,TUNDE,00:00:03:12");
  });
});

describe("OpenTimelineIO", () => {
  const files = { ta: "C:\\Users\\me\\Documents\\Greenroom\\a b.wav", tb: "C:\\x\\b.mp3", s1: "C:\\x\\door.mp3", bed1: "C:\\x\\rain.mp3" };
  it("turns Windows paths into file URLs", () => {
    expect(fileUrl("C:\\Users\\me\\My Folder\\a.wav")).toBe("file:///C:/Users/me/My%20Folder/a.wav");
    expect(fileUrl("/home/me/a.wav")).toBe("file:///home/me/a.wav");
  });
  it("builds one audio track per character, sound clips and atmosphere with exact positions", () => {
    const p = project();
    const doc = JSON.parse(otioTimeline(p, planTimeline(p), 24, files));
    expect(doc.OTIO_SCHEMA).toBe("Timeline.1");
    const tracks = doc.tracks.children;
    expect(tracks.map((t: { name: string }) => t.name)).toEqual(["ADA", "TUNDE", "Sound clips", "Atmosphere"]);
    expect(tracks.every((t: { kind: string }) => t.kind === "Audio")).toBe(true);
    const tunde = tracks[1].children;
    expect(tunde[0].OTIO_SCHEMA).toBe("Gap.1");
    expect(tunde[0].source_range.duration.value).toBe(3.5 * 24);
    expect(tunde[1].source_range.duration.value).toBe(24);
    expect(tunde[1].media_reference.target_url).toBe("file:///C:/x/b.mp3");
    expect(tunde[1].metadata.greenroom.gain_db).toBe(-3);
    const ada = tracks[0].children;
    expect(ada[0].media_reference.target_url).toBe("file:///C:/Users/me/Documents/Greenroom/a%20b.wav");
    expect(ada[0].name).toBe("01 ADA");
  });
  it("covers the whole scene with repeated atmosphere clips and trims the last", () => {
    const p = project();
    const plan = planTimeline(p);
    const doc = JSON.parse(otioTimeline(p, plan, 24, files));
    const bed = doc.tracks.children[3].children;
    const total = bed.reduce((s: number, c: { source_range: { duration: { value: number } } }) => s + c.source_range.duration.value, 0);
    expect(total).toBeCloseTo(plan.total * 24, 3);
    expect(bed.length).toBe(Math.ceil(plan.total / 4));
  });
  it("marks a clip as missing media when its file was not exported", () => {
    const p = project();
    const doc = JSON.parse(otioTimeline(p, planTimeline(p), 24, {}));
    expect(doc.tracks.children[0].children[0].media_reference.OTIO_SCHEMA).toBe("MissingReference.1");
  });
});
