import type { PublicPlayer, RankingEntry } from "../../shared/protocol.ts";
import { avatarColor } from "./avatar";

export default function Sidebar({
  open,
  players,
  ranking,
  phase,
  showScores,
  onSelect,
}: {
  open: boolean;
  players: PublicPlayer[];
  ranking: RankingEntry[];
  phase: string;
  showScores: boolean;
  onSelect: (player: PublicPlayer) => void;
}) {
  const ranked = [...players].sort((a, b) => {
    if (!showScores) return 0;
    const ra = ranking.find((r) => r.playerId === a.id)?.rank || 99;
    const rb = ranking.find((r) => r.playerId === b.id)?.rank || 99;
    if (ra !== rb) return ra - rb;
    return b.score - a.score;
  });

  const scoring = showScores && (phase === "voting" || phase === "reveal" || phase === "finished");
  const allReady = phase === "preparation" && players.length >= 2 && players.every((p) => p.prepared);
  const title = scoring ? "Pontuação" : `Participantes (${players.length})`;

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <h2>{title}</h2>
      {ranked.map((player) => (
        <button
          key={player.id}
          className={`player ${player.isYou ? "active" : ""}`}
          onClick={() => onSelect(player)}
        >
          <span
            className={`avatar ${player.connected ? "" : "offline"}`}
            style={{ background: avatarColor(player.nickname) }}
          >
            <PersonIcon />
          </span>
          <span className="meta">
            <strong>
              {player.nickname}
              {player.isAdmin && (phase === "lobby" || phase === "preparation") ? (
                <span className="admin-mark">
                  <CrownIcon />
                  {phase === "lobby" ? " Admin" : null}
                </span>
              ) : null}
            </strong>
            <small>
              {phase === "preparation" ? (
                <span className={`status-tag ${player.prepared ? "ok" : ""}`}>
                  {player.prepared ? (allReady ? "Pronto" : "Preenchido") : "Pendente"}
                </span>
              ) : null}
            </small>
          </span>
          {scoring ? (
            <span className="score">{player.score}</span>
          ) : (
            <span className="more-dots" aria-hidden>
              ⋮
            </span>
          )}
        </button>
      ))}
      {phase === "preparation" && !allReady ? (
        <p className="sidebar-note">
          Aguardando todos preencherem suas afirmações para iniciar o jogo.
        </p>
      ) : null}
    </aside>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 19.5c.6-3.6 3.4-6 7-6s6.4 2.4 7 6" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg className="crown-icon" viewBox="0 0 16 14" width="14" height="12" aria-hidden>
      <path
        d="M1.5 12.5h13l-1-8-3.5 3.2L8 1.5 6 7.7 2.5 4.5l-1 8Z"
        fill="#e0ac30"
        stroke="#e0ac30"
        strokeLinejoin="round"
      />
    </svg>
  );
}
