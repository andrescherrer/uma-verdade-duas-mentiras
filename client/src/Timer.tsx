import { useEffect, useRef, useState } from "react";

export default function Timer({
  endsAt,
  serverNow,
}: {
  endsAt: number | null;
  serverNow: number;
}) {
  const offset = useRef(serverNow - Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    offset.current = serverNow - Date.now();
  }, [serverNow]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  if (!endsAt) return null;
  const remaining = Math.max(0, endsAt - (now + offset.current));
  const seconds = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="timer-pill" aria-label={`Tempo restante: ${seconds} segundos`}>
      <ClockIcon />
      {mm}:{ss}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
