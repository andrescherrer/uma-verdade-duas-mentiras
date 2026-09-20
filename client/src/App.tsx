import { useEffect, useState } from "react";
import AllGames from "./AllGames";
import HowToPlay from "./HowToPlay";
import Landing from "./Landing";
import RecentVisitors from "./RecentVisitors";
import Room from "./Room";

type View =
  | { kind: "landing" }
  | { kind: "howto" }
  | { kind: "overview" }
  | { kind: "visitors" }
  | { kind: "room"; roomId: string };

function viewFromPath(): View {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/como-jogar") return { kind: "howto" };
  if (path === "/todas-os-jogos") return { kind: "overview" };
  if (path === "/ultimos-30-dias") return { kind: "visitors" };
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
    go("/todas-os-jogos", { kind: "overview" });
  }

  function openVisitors() {
    go("/ultimos-30-dias", { kind: "visitors" });
  }

  function openLanding() {
    go("/", { kind: "landing" });
  }

  function openHowTo() {
    go("/como-jogar", { kind: "howto" });
  }

  if (view.kind === "howto") {
    return <HowToPlay onBack={openLanding} />;
  }
  if (view.kind === "overview") {
    return <AllGames onEnter={openRoom} onBack={openLanding} onShowVisitors={openVisitors} />;
  }
  if (view.kind === "visitors") {
    return <RecentVisitors onBack={openLanding} onShowAllGames={openOverview} />;
  }
  if (view.kind === "room") {
    return <Room roomId={view.roomId} onShowAllGames={openOverview} onHowToPlay={openHowTo} />;
  }
  return <Landing onEnter={openRoom} onShowAllGames={openOverview} onHowToPlay={openHowTo} />;
}
