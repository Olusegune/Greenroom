import { useApp } from "../ctx";
import { ChevronRight } from "../icons";
import { parseScript, SAMPLE_SCRIPT } from "../script";
import { Empty } from "../ui";

export default function Write() {
  const { project, edit, go } = useApp();
  if (!project) return null;

  const set = (script: string) =>
    edit((p) => {
      const parsed = parseScript(script, p.characters, p.lines);
      return { ...p, script, ...parsed };
    });

  const used = new Set(project.lines.map((l) => l.characterId));
  const counts = new Map<string, number>();
  project.lines.forEach((l) => counts.set(l.characterId, (counts.get(l.characterId) ?? 0) + 1));

  return (
    <section>
      <div>
        <h1>Script</h1>
        <p className="lede">
          Write each line as <span className="speaker">NAME: what they say</span>. Add a direction in brackets, like <span className="speaker">ADA (whispering): Keep quiet.</span> Start a new scene with <span className="speaker"># Title</span>. Any language works, and you can mix them in one line.
        </p>
      </div>
      <div className="row top" style={{ gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea className="script-area" aria-label="Script" spellCheck={false} value={project.script} onChange={(e) => set(e.target.value)} placeholder={"# Scene 1\nADA: Hello there.\nTUNDE (laughing): Hello yourself!"} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="sm" onClick={() => set(SAMPLE_SCRIPT)} disabled={project.script.trim().length > 0}>
              Insert a sample scene
            </button>
            <span className="muted small">Saved automatically.</span>
          </div>
        </div>
        <aside className="card" style={{ width: 280 }} aria-label="What Greenroom found">
          <h3>Found in your script</h3>
          {project.lines.length === 0 ? (
            <Empty title="No lines yet">Type a line like ADA: Hello.</Empty>
          ) : (
            <div className="stack">
              <p className="num">
                {project.scenes.length} scene{project.scenes.length === 1 ? "" : "s"}, {project.lines.length} line{project.lines.length === 1 ? "" : "s"}
              </p>
              {project.characters
                .filter((c) => used.has(c.id))
                .map((c) => (
                  <div key={c.id} className="row between">
                    <span className="speaker">{c.name}</span>
                    <span className="muted small">{counts.get(c.id)} lines</span>
                  </div>
                ))}
              <button className="primary" onClick={() => go("cast")}>
                Cast the voices <ChevronRight size={16} />
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
