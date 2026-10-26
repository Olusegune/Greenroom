import { useMemo, useState } from "react";
import { api, toUrl, type DesignPreview } from "../api";
import { useApp } from "../ctx";
import { fromBase64 } from "../audio";
import { ACCENTS, LANGUAGES, languageName } from "../languages";
import { Plus, Trash } from "../icons";
import { PlayButton, Empty, Note, Tabs, useBusy } from "../ui";
import type { VoiceEntry, VoiceInfo } from "../types";
import { useSample, voiceLine } from "../useSample";

type Tab = "mine" | "find" | "design" | "clone" | "vk";

const now = () => new Date().toISOString();

export default function Voices() {
  const [tab, setTab] = useState<Tab>("mine");
  return (
    <section>
      <div>
        <h1>Voices</h1>
        <p className="lede">Your library of voices: ones you found, designed, cloned or added. Every character in any project picks from here.</p>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[["mine", "My library"], ["find", "Find a voice"], ["design", "Design a voice"], ["clone", "Clone a voice"], ["vk", "VoiceKiller"]]}
      />
      {tab === "mine" && <Mine goFind={() => setTab("find")} />}
      {tab === "find" && <Find />}
      {tab === "design" && <Design />}
      {tab === "clone" && <Clone />}
      {tab === "vk" && <VoiceKiller />}
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

  const importAccount = () =>
    run(async () => {
      try {
        const mine = await api.voicesMine();
        const fresh = mine.filter((m) => !library.some((l) => l.id === m.id && l.provider === "elevenlabs"));
        saveLibrary((l) => [...l, ...fresh.filter((m) => !l.some((x) => x.id === m.id && x.provider === "elevenlabs")).map((m) => fromInfo(m, "account"))]);
        toast(fresh.length ? `Added ${fresh.length} voices from your ElevenLabs account.` : "Nothing new in your ElevenLabs account.");
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
      </div>
      {library.length === 0 ? (
        <Empty title="No voices yet">Find one in the shared library, design a new one from a description, or clone a voice you have permission to use.</Empty>
      ) : (
        <div className="grid">
          {library.map((v) => (
            <div key={v.provider + v.id} className="card voice-card">
              <div className="row between top">
                <h2>{v.name}</h2>
                <span className="badge accent">{v.provider === "voicekiller" ? "VoiceKiller" : v.source}</span>
              </div>
              <div className="meta">
                {voiceLine(v) && <span className="badge">{voiceLine(v)}</span>}
              </div>
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

function fromInfo(v: VoiceInfo, source: VoiceEntry["source"]): VoiceEntry {
  return { id: v.id, name: v.name, provider: "elevenlabs", source, language: v.language, accent: v.accent, gender: v.gender, notes: v.description, previewUrl: v.previewUrl ?? undefined, createdAt: now() };
}

function Find() {
  const { toast, keys } = useApp();
  const add = useAdd();
  const { busy, run } = useBusy();
  const [q, setQ] = useState({ search: "", language: "", accent: "", gender: "" });
  const [res, setRes] = useState<{ voices: VoiceInfo[]; more: boolean; page: number } | null>(null);

  const search = (page: number) =>
    run(async () => {
      try {
        const r = await api.voicesShared(q.search, q.language, q.accent, q.gender, page);
        setRes({ voices: page === 0 ? r.voices : [...(res?.voices ?? []), ...r.voices], more: r.more, page });
      } catch (e) {
        toast((e as Error).message, true);
      }
    });

  const take = async (v: VoiceInfo) => {
    if (!v.owner) return toast("This voice cannot be added from here.", true);
    try {
      const id = await api.voiceAddShared(v.owner, v.id, v.name);
      add({ ...fromInfo({ ...v, id }, "library") });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const preview = (v: VoiceInfo) => async () => {
    if (!v.previewUrl) throw new Error("No preview");
    return toUrl(await api.previewFetch(v.previewUrl));
  };

  return (
    <>
      <p className="muted">Search ElevenLabs&apos; shared voice library. Pick a language and an accent to hear voices that fit your character. Previews are free.</p>
      {!keys.elevenlabs && <Note kind="warn">Add your ElevenLabs key in Settings to search.</Note>}
      <form
        className="card row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void search(0);
        }}
      >
        <input type="search" aria-label="Search voices" placeholder="Search, for example warm elder" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
        <select aria-label="Language" value={q.language} onChange={(e) => setQ({ ...q, language: e.target.value })}>
          <option value="">Any language</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <select aria-label="Accent" value={q.accent} onChange={(e) => setQ({ ...q, accent: e.target.value })}>
          <option value="">Any accent</option>
          {ACCENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select aria-label="Gender" value={q.gender} onChange={(e) => setQ({ ...q, gender: e.target.value })}>
          <option value="">Any gender</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
        <button className="primary" type="submit" disabled={busy || !keys.elevenlabs}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      <p className="lang-note small">Nigerian Pidgin, Taglish and other mixed languages have no filter of their own: write the lines in that language and choose a voice with the matching accent.</p>
      {res && res.voices.length === 0 && <Empty title="No voices matched">Try fewer filters.</Empty>}
      {res && res.voices.length > 0 && (
        <div className="grid">
          {res.voices.map((v) => (
            <div key={v.id} className="card voice-card">
              <h2>{v.name}</h2>
              <div className="meta">
                <span className="badge">{[languageName(v.language), v.accent, v.gender].filter(Boolean).join(" · ")}</span>
              </div>
              <p className="muted small">{v.description}</p>
              <div className="row">
                <PlayButton label="Preview" get={preview(v)} disabled={!v.previewUrl} />
                <span className="spacer" />
                <button className="sm primary" onClick={() => void take(v)}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {res?.more && (
        <button onClick={() => void search(res.page + 1)} disabled={busy}>
          Show more
        </button>
      )}
    </>
  );
}

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
    const go = await confirmSpend({ title: "Design a voice?", lines: ["Makes up to 3 preview voices from your description", "Uses ElevenLabs credits for each preview"] });
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
      <p className="muted">Describe the voice you imagine, including age, accent, tone and pace. You get three previews to choose from.</p>
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

function VoiceKiller() {
  const { keys, toast } = useApp();
  const add = useAdd();
  const sample = useSample();
  const { busy, run } = useBusy();
  const [list, setList] = useState<{ name: string; language: string }[] | null>(null);
  const [filter, setFilter] = useState("");
  const [cloneName, setCloneName] = useState("");

  const load = () =>
    run(async () => {
      try {
        setList(await api.voicesVoiceKiller());
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
  const shown = useMemo(() => (list ?? []).filter((v) => v.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 120), [list, filter]);
  const entry = (name: string, language: string, vkClone = false): Parameters<ReturnType<typeof useAdd>>[0] => ({ id: name, name, provider: "voicekiller", vkClone, source: vkClone ? "cloned" : "library", language, accent: "", gender: "", notes: vkClone ? "Cloned on voicekiller.com" : "" });

  return (
    <>
      <p className="muted">VoiceKiller offers about two thousand voices in many languages. It has no laugh or cough sounds, so for those use an ElevenLabs voice or add a sound clip. Delivery and pace are sent as instructions.</p>
      {!keys.voicekiller && <Note kind="warn">Add your VoiceKiller key and user id in Settings first.</Note>}
      <div className="row wrap">
        <button className="primary" onClick={() => void load()} disabled={busy || !keys.voicekiller}>
          {busy ? "Loading…" : list ? "Reload voices" : "Load voice list"}
        </button>
        {list && <input type="search" aria-label="Filter voices" placeholder={`Filter ${list.length} voices`} value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>
      {list && (
        <div className="grid">
          {shown.map((v) => (
            <div key={v.name} className="card voice-card">
              <h2>{v.name}</h2>
              <div className="meta">
                <span className="badge">{v.language}</span>
              </div>
              <div className="row">
                <PlayButton label="Hear it" get={() => sample({ ...entry(v.name, v.language), notes: "", createdAt: "" })} />
                <span className="spacer" />
                <button className="sm primary" onClick={() => add(entry(v.name, v.language))}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="card stack">
        <h2>A voice you cloned on voicekiller.com</h2>
        <p className="muted small">Clones cannot be created through their API, so register one here by the exact name you gave it on their website.</p>
        <div className="row">
          <input type="text" aria-label="Clone name on VoiceKiller" placeholder="Exact name of the clone" value={cloneName} onChange={(e) => setCloneName(e.target.value)} style={{ flex: 1 }} />
          <button
            disabled={!cloneName.trim()}
            onClick={() => {
              add(entry(cloneName.trim(), "en", true));
              setCloneName("");
            }}
          >
            Register clone
          </button>
        </div>
      </div>
    </>
  );
}
