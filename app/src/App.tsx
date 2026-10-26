import { useEffect, useState } from "react";
import { Provider, useApp, type Tab } from "./ctx";
import { Cast as CastIcon, Export as ExportIcon, Gear, Home as HomeIcon, Layers, Mark, Render, Script, Speaker, Voices as VoicesIcon } from "./icons";
import Cast from "./screens/Cast";
import Engines from "./screens/Engines";
import Export from "./screens/Export";
import Home from "./screens/Home";
import Lab from "./screens/Lab";
import Perform from "./screens/Perform";
import Settings from "./screens/Settings";
import Voices from "./screens/Voices";
import Write from "./screens/Write";

export default function App() {
  const [splash, setSplash] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    const a = setTimeout(() => setSplash("fade"), 1400);
    const b = setTimeout(() => setSplash("gone"), 1900);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  return (
    <Provider>
      {splash !== "gone" && (
        <div className={splash === "fade" ? "splash out" : "splash"} onClick={() => setSplash("gone")} role="presentation">
          <img src="/splash.webp" alt="Greenroom. Sound without limits." />
        </div>
      )}
      <Shell />
    </Provider>
  );
}

function Shell() {
  const { tab, go, project, closeProject, saving } = useApp();
  const Item = ({ id, label, icon, count, off }: { id: Tab; label: string; icon: React.ReactNode; count?: string; off?: boolean }) => (
    <button className={tab === id ? "nav on" : "nav"} onClick={() => go(id)} disabled={off} aria-current={tab === id ? "page" : undefined}>
      {icon}
      <span className="label">{label}</span>
      {count && <span className="count">{count}</span>}
    </button>
  );
  const takes = project ? project.lines.filter((l) => l.takes.length > 0).length : 0;
  const screens: Record<Tab, React.ReactNode> = { home: <Home />, write: <Write />, cast: <Cast />, perform: <Perform />, export: <Export />, voices: <Voices />, engines: <Engines />, lab: <Lab />, settings: <Settings /> };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <Mark size={30} />
          <span className="brand-name">Greenroom</span>
        </div>
        <Item id="home" label="Projects" icon={<HomeIcon size={18} />} />
        {project && (
          <>
            <h3>{project.name.slice(0, 22)}</h3>
            <Item id="write" label="Script" icon={<Script size={18} />} count={project.lines.length ? String(project.lines.length) : undefined} />
            <Item id="cast" label="Cast" icon={<CastIcon size={18} />} />
            <Item id="perform" label="Perform" icon={<Render size={18} />} count={project.lines.length ? `${takes}/${project.lines.length}` : undefined} />
            <Item id="export" label="Export" icon={<ExportIcon size={18} />} />
          </>
        )}
        <h3>Library</h3>
        <Item id="voices" label="Voices" icon={<VoicesIcon size={18} />} />
        <Item id="engines" label="Engines" icon={<Layers size={18} />} />
        <Item id="lab" label="Voice lab" icon={<Speaker size={18} />} />
        <Item id="settings" label="Settings" icon={<Gear size={18} />} />
        <div className="rail-foot">
          {project && (
            <>
              <div aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}</div>
              <button className="sm ghost" onClick={closeProject}>
                Close project
              </button>
            </>
          )}
        </div>
      </nav>
      <main className="stage">{screens[tab]}</main>
    </div>
  );
}
