import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DesignPreview, type PiperVoice } from "../api";
import { useApp } from "../ctx";
import { ENGINES, ENGINE_ORDER, type Engine } from "../engines";
import { kieFor, piperFor, voicekillerFor, type Found } from "../finder";
import { Flag } from "../flags";
import { Plus, Trash } from "../icons";
import { ACCENTS, languageName, TILES, type Tile } from "../languages";
import { fromBase64 } from "../audio";
import type { VoiceEntry } from "../types";
import { Empty, Note, PlayButton, Tabs, useBusy } from "../ui";
import { useSample, voiceLine } from "../useSample";

type TabId = "mine" | "find" | "design" | "clone";
const now = () => new Date().toISOString();

export default function Voices() {
  const [tab, setTab] = useState<TabId>("mine");
  return (
    <section>
      <div>
        <h1>Voices</h1>
        <p className="lede">Your library of voices from every engine. Every character in any project picks from here.</p>
      </div>
      <Tabs<TabId> value={tab} onChange={setTab} items={[["mine", "My library"], ["find", "Find a voice"], ["design", "Design a voice"], ["clone", "Clone a voice"]]} />
      {tab === "mine" && <Mine goFind={() => setTab("find")} />}
      {tab === "find" && <Find />}
      {tab === "design" && <Design />}
      {tab === "clone" && <Clone />}
    </section>
  );
}

function useAdd() {
  const { library, saveLibrary, toast } = useApp();
  return (v: Omit<VoiceEntry, "notes" | "createdAt"> & Partial<Pick<VoiceEntry, "notes">>) => {
    if (library.some((x) => x.id === v.id && x.provider === v.provider)) {
      toast(`${v.name} is already in your library.`);
      return;
    }
    saveLibrary((l) => (l.some((x) => x.id === v.id && x.provider === v.provider) ? l : [...l, { notes: "", createdAt: now(), ...v }]));
    toast(`${v.name} added to your library.`);
  };
}

function Mine({ goFind }: { goFind: () => void }) {
  const { library, saveLibrary, keys, toast } = useApp();
  const sample = useSample();
  const { busy, run } = useBusy();
  const [sure, setSure] = useState("");
  const [only, setOnly] = useState<Engine | "all">("all");

  const importAccount = () =>
    run(async () => {
      try {
        const mine = await api.voicesMine();
        let added = 0;
        saveLibrary((l) => {
          const fresh = mine.filter((m) => !l.some((x) => x.id === m.id && x.provider === "elevenlabs"));
          added = fresh.length;
          return [...l, ...fresh.map((m): VoiceEntry => ({ id: m.id, name: m.name, provider: "elevenlabs", source: "account", language: m.language, accent: m.accent, gender: m.gender, notes: m.description, previewUrl: m.previewUrl ?? undefined, createdAt: now() }))];
        });
        toast(added ? `Added ${added} voices from your ElevenLabs account.` : "Nothing new in your ElevenLabs account.");
      } catch (e) {
        toast((e as Error).message, true);
      }
    });

  const patch = (id: string, provider: string, p: Partial<VoiceEntry>) => saveLibrary((l) => l.map((v) => (v.id === id && v.provider === provider ? { ...v, ...p } : v)));
  const remove = (v: VoiceEntry) => saveLibrary((l) => l.filter((x) => !(x.id === v.id && x.provider === v.provider)));
  const deleteRemote = async (v: VoiceEntry) => {
    try {
      await api.voiceDelete(v.id);
      remove(v);
      toast(`${v.name} deleted from ElevenLabs.`);
    } catch (e) {
      toast((e as Error).message, true);
    }
    setSure("");
  };
  const shown = library.filter((v) => only === "all" || v.provider === only);
  const present = ENGINE_ORDER.filter((e) => library.some((v) => v.provider === e));

  return (
    <>
      <div className="row wrap">
        <button className="primary" onClick={goFind}>
          <Plus size={16} /> Find a voice
        </button>
        <button onClick={() => void importAccount()} disabled={busy || !keys.elevenlabs}>
          {busy ? "Importing…" : "Import from my ElevenLabs account"}
        </button>
        <span className="muted small">{library.length} voice{library.length === 1 ? "" : "s"}</span>
        {present.length > 1 && (
          <span className="chips" role="group" aria-label="Show engine">
            <button className="chip" aria-pressed={only === "all"} onClick={() => setOnly("all")}>
              All
            </button>
            {present.map((e) => (
              <button key={e} className="chip" aria-pressed={only === e} onClick={() => setOnly(e)}>
                {ENGINES[e].label}
              </button>
            ))}
          </span>
        )}
      </div>
      {library.length === 0 ? (
        <Empty title="No voices yet">Pick a language in Find a voice, design a new voice from a description, or clone a voice you have permission to use.</Empty>
      ) : (
        <div className="grid">
          {shown.map((v) => (
            <div key={v.provider + v.id} className="card voice-card">
              <div className="row between top">
                <h2>{v.name}</h2>
                <span className="badge accent">{ENGINES[v.provider].label}</span>
              </div>
              <div className="meta">{voiceLine(v) && <span className="badge">{voiceLine(v)}</span>}</div>
              <input type="text" aria-label={`Notes for ${v.name}`} placeholder="Notes, for example: good for Ada's older sister" value={v.notes} onChange={(e) => patch(v.id, v.provider, { notes: e.target.value })} />
              <div className="row wrap">
                <PlayButton label="Hear it" get={() => sample(v)} />
                <span className="spacer" />
                {sure === v.provider + v.id ? (
                  <>
                    <button className="sm danger" onClick={() => void deleteRemote(v)}>
                      Really delete
                    </button>
                    <button className="sm ghost" onClick={() => setSure("")}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    {v.provider === "elevenlabs" && (v.source === "designed" || v.source === "cloned") && (
                      <button className="sm ghost" onClick={() => setSure(v.provider + v.id)} title="Also deletes it from your ElevenLabs account">
                        Delete from ElevenLabs
                      </button>
                    )}
                    <button className="sm icon ghost" aria-label={`Remove ${v.name} from the library`} onClick={() => remove(v)}>
                      <Trash size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Find a voice -------------------------------------------------------------------------------------------------

type Slot = { state: "idle" | "loading" | "done" | "error"; items: Found[]; error?: string; more?: boolean; page?: number };
const idle: Slot = { state: "idle", items: [] };

let vkCache: { name: string; language: string }[] | null = null;
let piperCache: PiperVoice[] | null = null;

function Find() {
  const { keys, toast, library, confirmSpend } = useApp();
  const add = useAdd();
  const [tile, setTile] = useState<Tile | null>(null);
  const [filter, setFilter] = useState("");
  const [gender, setGender] = useState("");
  const [accent, setAccent] = useState("");
  const [text, setText] = useState("");
  const [on, setOn] = useState<Record<Engine, boolean>>({ elevenlabs: true, voicekiller: true, kie: true, piper: true, local: false });
  const [slots, setSlots] = useState<Partial<Record<Engine, Slot>>>({});
  const [busyKey, setBusyKey] = useState("");
  const [expanded, setExpanded] = useState<Partial<Record<Engine, boolean>>>({});
  const token = useRef(0);

  const ready: Record<Engine, boolean> = { elevenlabs: keys.elevenlabs, voicekiller: keys.voicekiller, kie: keys.kie, piper: true, local: false };
  const set = (e: Engine, s: Slot) => setSlots((all) => ({ ...all, [e]: s }));

  const tiles = useMemo(() => TILES.filter((t) => t.name.toLowerCase().includes(filter.trim().toLowerCase())), [filter]);

  // Fetch from every ticked engine whenever the language or filters change.
  useEffect(() => {
    const my = ++token.current;
    const ok = (e: Engine) => on[e] && ready[e];
    const guard = (f: () => void) => token.current === my && f();
    const timer = setTimeout(() => {
      if (ok("elevenlabs")) {
        set("elevenlabs", { state: "loading", items: [] });
        api
          .voicesShared(text, tile?.lang ?? "", accent || tile?.accent || "", gender, 0)
          .then((r) => guard(() => set("elevenlabs", { state: "done", items: r.voices.map((v) => ({ engine: "elevenlabs" as const, id: v.id, name: v.name, language: v.language, accent: v.accent, gender: v.gender, description: v.description, previewUrl: v.previewUrl, owner: v.owner })), more: r.more, page: 0 })))
          .catch((e: Error) => guard(() => set("elevenlabs", { state: "error", items: [], error: e.message })));
      } else set("elevenlabs", idle);

      const needLang = (e: Engine, load: () => Promise<Found[]>) => {
        if (!ok(e)) return set(e, idle);
        if (!tile) return set(e, { state: "idle", items: [] });
        set(e, { state: "loading", items: [] });
        load()
          .then((items) => guard(() => set(e, { state: "done", items: items.filter((i) => (!gender || !i.gender || i.gender === gender) && (!text || i.name.toLowerCase().includes(text.toLowerCase()) || i.description.toLowerCase().includes(text.toLowerCase()))) })))
          .catch((err: Error) => guard(() => set(e, { state: "error", items: [], error: err.message })));
      };
      needLang("voicekiller", async () => voicekillerFor(tile!, (vkCache ??= await api.voicesVoiceKiller())));
      needLang("kie", async () => kieFor(tile!));
      needLang("piper", async () => piperFor(tile!, (piperCache ??= await api.piperCatalog())));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile, gender, accent, text, on, keys.elevenlabs, keys.voicekiller, keys.kie]);

  const more = async (e: "elevenlabs") => {
    const s = slots[e];
    if (!s) return;
    try {
      const r = await api.voicesShared(text, tile?.lang ?? "", accent || tile?.accent || "", gender, (s.page ?? 0) + 1);
      set(e, { ...s, items: [...s.items, ...r.voices.map((v) => ({ engine: "elevenlabs" as const, id: v.id, name: v.name, language: v.language, accent: v.accent, gender: v.gender, description: v.description, previewUrl: v.previewUrl, owner: v.owner }))], more: r.more, page: (s.page ?? 0) + 1 });
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const toEntry = (f: Found, id = f.id): Omit<VoiceEntry, "notes" | "createdAt"> => ({ id, name: f.name, provider: f.engine, source: "library", language: f.language, accent: f.accent, gender: f.gender });
  const asVoice = (f: Found): VoiceEntry => ({ ...toEntry(f), notes: "", createdAt: "", previewUrl: f.previewUrl ?? undefined });
  const sample = useSample();

  const take = async (f: Found) => {
    const key = f.engine + f.id;
    setBusyKey(key);
    try {
      if (f.engine === "elevenlabs") {
        if (!f.owner) throw new Error("This voice cannot be added from here.");
        add(toEntry(f, await api.voiceAddShared(f.owner, f.id, f.name)));
      } else if (f.engine === "piper") {
        const have = (await api.piperStatus()).voices.includes(f.id);
        if (!have) {
          const ok = await confirmSpend({ title: "Download this voice?", lines: [`${f.sizeMb} MB from the public Piper voice catalogue`, "The first time, the Piper program (22 MB) is downloaded too", "Then it works offline and is free to use"], download: true });
          if (!ok) return;
          const st = await api.piperStatus();
          if (!st.installed) await api.piperInstall();
          await api.piperInstallVoice(f.id);
        }
        add(toEntry(f));
      } else add(toEntry(f));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusyKey("");
    }
  };

  const inLib = (f: Found) => library.some((x) => x.id === f.id && x.provider === f.engine);
  const hear = (f: Found) => () => (f.engine === "piper" ? Promise.reject(new Error("Add this voice first to hear it.")) : sample(asVoice(f)));

  const engineList = ENGINE_ORDER.filter((e) => e !== "local");
  return (
    <>
      <p className="muted">Pick a language to see voices for it from every engine you have set up. No need to know a voice by name.</p>

      <div className="card stack">
        <div className="row wrap">
          <span className="muted small">Show voices from</span>
          <span className="chips" role="group" aria-label="Engines">
            {engineList.map((e) => (
              <button key={e} className="chip" aria-pressed={on[e] && ready[e]} disabled={!ready[e]} title={ready[e] ? "" : "Add its key in Settings first"} onClick={() => setOn({ ...on, [e]: !on[e] })}>
                {ENGINES[e].label}
              </button>
            ))}
          </span>
        </div>
        <div className="row wrap">
          <input type="search" aria-label="Find a language" placeholder="Find a language, for example Yoruba" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select aria-label="Gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Any gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          <select aria-label="Accent" value={accent} onChange={(e) => setAccent(e.target.value)}>
            <option value="">Any accent</option>
            {ACCENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input type="search" aria-label="Describe or name a voice (optional)" placeholder="Describe it (optional): warm, deep…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>

      <div className="tiles" role="group" aria-label="Languages">
        <button className="tile" aria-pressed={tile === null} onClick={() => setTile(null)}>
          <span className="flag-ph" style={{ width: 22, height: 16 }} aria-hidden="true" />
          Popular
        </button>
        {tiles.map((t) => (
          <button key={t.id} className="tile" aria-pressed={tile?.id === t.id} onClick={() => setTile(t)}>
            <Flag cc={t.cc} />
            {t.name}
          </button>
        ))}
        {tiles.length === 0 && <span className="muted">No language matches that.</span>}
      </div>

      <h3>{tile ? `Voices for ${tile.name}` : "Popular voices on ElevenLabs"}</h3>
      {!tile && <p className="muted small">Choose a language above to also see VoiceKiller, Kie and offline Piper voices.</p>}
      {tile?.mixed && <Note>{tile.name} has no language of its own. Write the lines the way they are spoken and pick a voice with a matching accent. Piper and Kie are not offered for it.</Note>}

      {engineList.map((e) => {
        const s = slots[e];
        if (!on[e] || !ready[e] || !s || s.state === "idle") return null;
        return (
          <div key={e} className="stack">
            <div className="row">
              <h2>{ENGINES[e].label}</h2>
              {ENGINES[e].local && <span className="badge ok">Offline, free</span>}
              {s.state === "done" && <span className="muted small">{s.items.length}{s.more ? "+" : ""} voices</span>}
            </div>
            {s.state === "loading" && <p className="muted">Looking…</p>}
            {s.state === "error" && <Note kind="err">{s.error}</Note>}
            {s.state === "done" && s.items.length === 0 && <p className="muted">No voices matched here. Try fewer filters.</p>}
            <div className="grid">
              {s.items.slice(0, expanded[e] ? s.items.length : 24).map((f) => (
                <div key={f.engine + f.id} className="card voice-card">
                  <h2>{f.name}</h2>
                  <div className="meta">
                    <span className="badge">{[languageName(f.language.split(/[-_]/)[0] ?? f.language), f.accent, f.gender].filter(Boolean).join(" · ") || f.language}</span>
                    {f.sizeMb ? <span className="badge">{f.sizeMb} MB</span> : null}
                  </div>
                  {f.description && <p className="muted small">{f.description}</p>}
                  <div className="row">
                    {f.engine === "piper" ? <span className="muted small">Hear it after adding</span> : <PlayButton label="Hear it" get={hear(f)} disabled={!f.previewUrl && f.engine === "elevenlabs"} />}
                    <span className="spacer" />
                    <button className="sm primary" disabled={inLib(f) || busyKey === f.engine + f.id} onClick={() => void take(f)}>
                      {inLib(f) ? "In library" : busyKey === f.engine + f.id ? "Adding…" : (<><Plus size={14} /> {f.engine === "piper" ? "Download" : "Add"}</>)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {s.items.length > 24 && !expanded[e] && (
              <div>
                <button onClick={() => setExpanded({ ...expanded, [e]: true })}>Show all {s.items.length}</button>
              </div>
            )}
            {e === "elevenlabs" && s.more && (
              <div>
                <button onClick={() => void more("elevenlabs")}>Show more</button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---- Design and clone ---------------------------------------------------------------------------------------------

const EXAMPLES = [
  "An older Nigerian man, warm and gravelly, speaking slowly with quiet authority",
  "A young Lagos woman, bright and quick, with a teasing laugh in her voice",
  "A gentle Korean grandmother, soft and a little shaky, kind",
  "A tired British detective, dry and low, weary after a long night",
];

function Design() {
  const { confirmSpend, toast, keys } = useApp();
  const add = useAdd();
  const { busy, run } = useBusy();
  const [desc, setDesc] = useState("");
  const [sample, setSample] = useState("");
  const [previews, setPreviews] = useState<{ p: DesignPreview; url: string; name: string }[]>([]);
  const ok = desc.trim().length >= 20;

  const make = async () => {
    const go = await confirmSpend({ title: "Design a voice?", lines: ["Makes up to 3 preview voices from your description", "Uses ElevenLabs credits for each preview. Saving a voice to your account needs a plan that allows it."] });
    if (!go) return;
    await run(async () => {
      try {
        const out = await api.voiceDesign(desc, sample.trim() || undefined);
        setPreviews(out.map((p, i) => ({ p, url: URL.createObjectURL(new Blob([fromBase64(p.audioB64) as BlobPart], { type: "audio/mpeg" })), name: `Designed voice ${i + 1}` })));
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
  };
  const save = async (i: number) => {
    const it = previews[i]!;
    try {
      const id = await api.voiceDesignSave(it.p.generatedVoiceId, it.name, desc);
      add({ id, name: it.name, provider: "elevenlabs", source: "designed", language: "", accent: "", gender: "", notes: desc.slice(0, 160) });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <p className="muted">Describe the voice you imagine, including age, accent, tone and pace. You get three previews to choose from. Keeping one in your account may need a paid ElevenLabs plan; if it does, the app will say so.</p>
      {!keys.elevenlabs && <Note kind="warn">Add your ElevenLabs key in Settings first.</Note>}
      <div className="card stack">
        <label className="field">
          Describe the voice (20 to 1000 characters)
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={EXAMPLES[0]} />
        </label>
        <div className="chips" aria-label="Examples">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" aria-pressed={desc === e} onClick={() => setDesc(e)}>
              {e.slice(0, 38)}…
            </button>
          ))}
        </div>
        <label className="field">
          What it should say (optional, 100 to 1000 characters; leave empty for an automatic line)
          <textarea rows={2} value={sample} onChange={(e) => setSample(e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" disabled={!ok || busy || !keys.elevenlabs} onClick={() => void make()}>
            {busy ? "Designing…" : "Make 3 previews"}
          </button>
          {!ok && desc.length > 0 && <span className="muted small">A little more detail, please.</span>}
        </div>
      </div>
      {previews.map((it, i) => (
        <div key={it.p.generatedVoiceId} className="card row wrap lit">
          <audio controls src={it.url} />
          <input type="text" aria-label={`Name for preview ${i + 1}`} value={it.name} onChange={(e) => setPreviews(previews.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ flex: 1, minWidth: 160 }} />
          <button className="primary" onClick={() => void save(i)}>
            Save this voice
          </button>
        </div>
      ))}
    </>
  );
}

function Clone() {
  const { keys, toast } = useApp();
  const add = useAdd();
  const { busy, run } = useBusy();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [perm, setPerm] = useState(false);
  const ready = name.trim() && file && perm && keys.elevenlabs;

  const go = () =>
    run(async () => {
      if (!file) return;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const id = await api.voiceClone(name.trim(), file.name, file.type || "audio/mpeg", btoa(s), perm);
        add({ id, name: name.trim(), provider: "elevenlabs", source: "cloned", language: "", accent: "", gender: "", notes: "Cloned in Greenroom" });
        setName("");
        setFile(null);
        setPerm(false);
      } catch (e) {
        toast((e as Error).message, true);
      }
    });

  return (
    <>
      <p className="muted">Make a voice from a recording. A clean minute or more of one person speaking, with no music or other voices, works best.</p>
      <div className="card stack">
        <label className="field">
          Name for this voice
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Mum" />
        </label>
        <label className="field">
          Recording (WAV, MP3, M4A, up to 30 MB)
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="row">
          <input type="checkbox" checked={perm} onChange={(e) => setPerm(e.target.checked)} />
          <span>I have permission from the person whose voice this is to clone it.</span>
        </label>
        <p className="muted small">The recording is sent to ElevenLabs to create the voice. Cloning needs a plan that includes it.</p>
        <div>
          <button className="primary" disabled={!ready || busy} onClick={() => void go()}>
            {busy ? "Creating…" : "Create clone"}
          </button>
        </div>
      </div>
    </>
  );
}
