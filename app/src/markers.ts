// Files that help a mix travel into other software: markers, a label track, a cue sheet and an OpenTimelineIO timeline.
// OpenTimelineIO (.otio) is read by DaVinci Resolve, Premiere (through adapters) and others. The file follows the OTIO
// 1.0 JSON schema, but it has not been opened in those programs yet: see docs/QA notes before relying on it.

import { stemSets, type Plan } from "./audio";
import { chosenTake } from "./direct";
import { ENGINES } from "./engines";
import { fpsOf, fpsValue, tcAt } from "./picture";
import { rightsFor } from "./trust";
import type { Picture, Project, VoiceEntry } from "./types";

export interface Marker {
  sec: number;
  endSec: number;
  name: string;
  /** 1-based position among all lines of the script, the same number used in exported file names. */
  number: number;
  lineId: string;
}

export function buildMarkers(project: Pick<Project, "lines" | "characters">, plan: Plan): Marker[] {
  // A line that starts after the end of the mix has nowhere to put a marker.
  return plan.spans.filter((s) => s.start < plan.total).map((s) => {
    const idx = project.lines.findIndex((l) => l.id === s.lineId);
    const line = project.lines[idx];
    const who = project.characters.find((c) => c.id === line?.characterId)?.name ?? "Line";
    const number = idx + 1;
    return { sec: s.start, endSec: s.end, name: `${String(number).padStart(2, "0")} ${who}`, number, lineId: s.lineId };
  });
}

/** HH:MM:SS:FF at a whole frame rate (non-drop). */
export function timecode(sec: number, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const total = Math.floor(Math.max(0, sec) * f + 1e-6);
  const frames = total % f;
  const s = Math.floor(total / f);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(frames)}`;
}

/** Audacity label track: start, end and name, tab separated. Also opens in Reaper and Adobe Audition as markers. */
export function audacityLabels(markers: Marker[]): string {
  return markers.map((m) => `${m.sec.toFixed(6)}\t${m.endSec.toFixed(6)}\t${m.name}`).join("\n") + "\n";
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A cue sheet of every spoken line, with what produced it. A BOM makes Excel read non-English names correctly. */
export function cueSheetCsv(project: Project, plan: Plan, fps: number, library: VoiceEntry[] = [], pic?: Picture): string {
  const tcOf = (sec: number) => (pic ? tcAt(sec, pic) : timecode(sec, fps));
  const head = ["Line", "Scene", "Character", "Start (TC)", "End (TC)", "Start (s)", "End (s)", "Duration (s)", "Text", "Direction", "Level (dB)", "Voice id", "Model", "Take id", "Sent to the voice", "Engine", "Audio quality", "SHA-256", "Voice rights"];
  const rights = (characterId: string): string => {
    const v = library.find((x) => x.id === project.characters.find((c) => c.id === characterId)?.voiceId);
    return v ? rightsFor(v, []).level : "";
  };
  const rows = plan.spans.map((s) => {
    const line = project.lines.find((l) => l.id === s.lineId)!;
    const take = chosenTake(line);
    const who = project.characters.find((c) => c.id === line.characterId)?.name ?? "";
    const d = line.direction;
    const direction = [d.emotion, ...d.sounds, d.note].filter(Boolean).join("; ");
    return [project.lines.indexOf(line) + 1, project.scenes[line.scene] ?? "", who, tcOf(s.start), tcOf(s.end), s.start.toFixed(3), s.end.toFixed(3), (s.end - s.start).toFixed(3), line.text, direction, (d.gain ?? 0).toFixed(1), take?.voiceId ?? "", take?.model ?? "", take?.id ?? "", take?.sent ?? "", take?.provenance ? ENGINES[take.provenance.engine].label : "", take?.provenance?.quality ?? "", take?.provenance?.sha256 ?? "", rights(line.characterId)].map(csvCell).join(",");
  });
  return "﻿" + [head.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}

export function fileUrl(path: string): string {
  const p = path.replace(/\\/g, "/");
  return encodeURI(/^[A-Za-z]:/.test(p) ? `file:///${p}` : p.startsWith("/") ? `file://${p}` : p);
}

const rt = (value: number, rate: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: Math.round(value * 1e6) / 1e6 });

/**
 * One audio track per stem (each character, sound clips, atmosphere), clips placed at their exact times and pointing at
 * the exported original files. `files` maps a take id to the absolute path it was exported to. The atmosphere loop is laid
 * out as repeated clips because OTIO has no loop. Clips that overlap on a track (dialogue talking over itself) go onto
 * extra lanes named "ADA 2", because a track cannot hold two clips at once. With a picture, the timeline uses its exact
 * frame rate and start timecode and carries a video track pointing at the file.
 */
export function otioTimeline(project: Project, plan: Plan, fps: number, files: Record<string, string>, pic?: Picture): string {
  const rate = pic ? fpsValue(fpsOf(pic)) : fps;
  const range = (startSec: number, durSec: number) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: rt(startSec * rate, rate), duration: rt(durSec * rate, rate) });
  const gapOf = (dur: number) => ({ OTIO_SCHEMA: "Gap.1", name: "", source_range: range(0, dur), effects: [], markers: [], metadata: {}, enabled: true });
  const track = (name: string, kind: "Audio" | "Video", children: unknown[]) => ({ OTIO_SCHEMA: "Track.1", name, kind, children, source_range: null, effects: [], markers: [], metadata: {}, enabled: true });

  const chars = project.characters.map((c) => ({ id: c.id, name: c.name }));
  const audio: unknown[] = [];
  for (const stem of stemSets(plan, chars)) {
    const items = plan.items.filter(stem.filter).sort((a, b) => a.start - b.start);
    const lanes: { cursor: number; children: unknown[] }[] = [];
    const place = (name: string, at: number, dur: number, mediaSec: number, takeId: string, meta: object) => {
      let lane = lanes.find((l) => l.cursor <= at + 1e-6);
      if (!lane) {
        lane = { cursor: 0, children: [] };
        lanes.push(lane);
      }
      if (at > lane.cursor + 1e-6) lane.children.push(gapOf(at - lane.cursor));
      const target = files[takeId];
      lane.children.push({
        OTIO_SCHEMA: "Clip.2",
        name,
        source_range: range(0, dur),
        media_reference: target ? { OTIO_SCHEMA: "ExternalReference.1", target_url: fileUrl(target), available_range: range(0, mediaSec), metadata: {} } : { OTIO_SCHEMA: "MissingReference.1", name: "", available_range: range(0, mediaSec), metadata: {} },
        effects: [],
        markers: [],
        metadata: { greenroom: meta },
        enabled: true,
      });
      lane.cursor = at + dur;
    };
    for (const it of items) {
      if (it.kind === "bed") {
        let at = it.start;
        const end = it.start + it.seconds;
        while (at < end - 1e-6) {
          const dur = Math.min(it.ref.seconds ?? it.seconds, end - at);
          place("Atmosphere", at, dur, it.ref.seconds ?? it.seconds, it.ref.id, { kind: "atmosphere", volume: project.bed.volume });
          at += dur;
        }
      } else {
        const line = project.lines.find((l) => l.id === it.lineId);
        const n = line ? project.lines.indexOf(line) + 1 : 0;
        const label = it.kind === "speech" ? `${String(n).padStart(2, "0")} ${stem.name}` : `${String(n).padStart(2, "0")} sound clip`;
        place(label, it.start, it.seconds, it.seconds, it.ref.id, { kind: it.kind, gain_db: it.gainDb, text: it.kind === "speech" ? line?.text : undefined });
      }
    }
    lanes.forEach((l, i) => audio.push(track(i === 0 ? stem.name : `${stem.name} ${i + 1}`, "Audio", l.children)));
  }

  const video: unknown[] = pic
    ? [
        track("Picture", "Video", [
          {
            OTIO_SCHEMA: "Clip.2",
            name: pic.name,
            source_range: range(0, pic.duration),
            media_reference: { OTIO_SCHEMA: "ExternalReference.1", target_url: fileUrl(pic.path), available_range: range(0, pic.duration), metadata: {} },
            effects: [],
            markers: [],
            metadata: {},
            enabled: true,
          },
        ]),
      ]
    : [];

  return JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: project.name,
      global_start_time: pic ? rt(pic.startFrame, rate) : null,
      metadata: { greenroom: { frame_rate: rate, start_timecode: pic ? tcAt(0, pic) : null, note: "Per-line level is applied in the mixed file and stems, not in the original line files." } },
      tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: [...video, ...audio], source_range: null, effects: [], markers: [], metadata: {}, enabled: true },
    },
    null,
    2,
  );
}
