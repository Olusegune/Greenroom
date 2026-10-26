import { useEffect, useState } from "react";
import { api, type ProjectInfo } from "../api";
import { useApp } from "../ctx";
import { Plus } from "../icons";
import { Empty } from "../ui";

export default function Home() {
  const { openProject, createProject, keys, go } = useApp();
  const [list, setList] = useState<ProjectInfo[] | null>(null);
  const [name, setName] = useState("");
  useEffect(() => void api.projectList().then(setList).catch(() => setList([])), []);
  const noKeys = !keys.elevenlabs && !keys.voicekiller && !keys.kie;

  return (
    <section>
      <div>
        <h1>Your projects</h1>
        <p className="lede">Write a scene, give each character a voice, direct how they sound, and export the finished audio.</p>
      </div>
      {noKeys && (
        <div className="note warn">
          <div>
            Add your ElevenLabs key first so voices can speak.{" "}
            <button className="sm" onClick={() => go("settings")}>
              Open Settings
            </button>
          </div>
        </div>
      )}
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          void createProject(name);
        }}
      >
        <input type="text" aria-label="New project name" placeholder="Name your project, for example Late Delivery" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <button className="primary" type="submit">
          <Plus size={16} /> New project
        </button>
      </form>
      {list === null ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <Empty title="Nothing here yet">Start a project above. Your scripts, voices and takes are all kept in Documents\Greenroom.</Empty>
      ) : (
        <div className="grid">
          {list.map((p) => (
            <button key={p.id} className="card" style={{ height: "auto", display: "grid", textAlign: "left", gap: 4 }} onClick={() => void openProject(p.id)}>
              <h2>{p.name}</h2>
              <span className="muted small">{p.updatedAt ? "Edited " + new Date(p.updatedAt).toLocaleString() : ""}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
