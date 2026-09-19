import { useEffect, useState } from "react";
import AllGames from "./AllGames";
import Landing from "./Landing";
import Room from "./Room";

type View = { kind: "landing" } | { kind: "overview" } | { kind: "room"; roomId: string };

function viewFromPath(): View {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/todas-os-jogos") return { kind: "overview" };
  const match = path.match(/^\/sala\/([A-Za-z0-9]+)/i);
  return match ? { kind: "room", roomId: match[1].toUpperCase() } : { kind: "landing" };
}

export default function App() {
  const [view, setView] = useState<View>(viewFromPath);

  useEffect(() => {
    const onPop = () => setView(viewFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function go(path: string, next: View) {
    window.history.pushState({}, "", path);
    setView(next);
  }

  function openRoom(id: string) {
    const roomId = id.toUpperCase();
    go(`/sala/${roomId}`, { kind: "room", roomId });
  }

  function openOverview() {
    window.location.assign("/todas-os-jogos");
  }

  function openLanding() {
    go("/", { kind: "landing" });
  }

  if (view.kind === "overview") {
    return <AllGames onEnter={openRoom} onBack={openLanding} />;
  }
  if (view.kind === "room") {
    return <Room roomId={view.roomId} onShowAllGames={openOverview} />;
  }
  return <Landing onEnter={openRoom} onShowAllGames={openOverview} />;
}
