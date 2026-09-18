import { useEffect, useState } from "react";
import Landing from "./Landing";
import Room from "./Room";

function roomFromPath(): string | null {
  const match = window.location.pathname.match(/^\/sala\/([A-Za-z0-9]+)/i);
  return match ? match[1].toUpperCase() : null;
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(roomFromPath);

  useEffect(() => {
    const onPop = () => setRoomId(roomFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openRoom(id: string) {
    const next = id.toUpperCase();
    window.history.pushState({}, "", `/sala/${next}`);
    setRoomId(next);
  }

  if (!roomId) return <Landing onEnter={openRoom} />;
  return <Room roomId={roomId} />;
}
