import { useEffect, useState } from "react";
import type { OverviewPayload, OverviewRoom, Phase } from "../../shared/protocol.ts";
import { AdminGate, adminLogout, fetchAdminSession } from "./AdminGate";
import { BrandHeading, LandingBlobs } from "./Landing";
import { avatarColor } from "./avatar";

const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Lobby",
  preparation: "Preparação",
  voting: "Votação",
  reveal: "Revelação",
  finished: "Encerrado",
};

export default function AllGames({
  onEnter,
  onBack,
  onShowVisitors,
}: {
  onEnter: (roomId: string) => void;
  onBack: () => void;
  onShowVisitors: () => void;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchAdminSession().then((ok) => {
      if (!cancelled) setAuthed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/rooms", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) {
            setAuthed(false);
            setData(null);
          }
          return;
        }
        if (!res.ok) throw new Error("Falha ao carregar.");
        const payload = (await res.json()) as OverviewPayload;
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Não foi possível listar as salas agora.");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authed]);

  async function logout() {
    await adminLogout();
    setAuthed(false);
    setData(null);
  }

  if (authed === null) {
    return (
      <main className="overview">
        <LandingBlobs />
        <section className="overview-hero">
          <BrandHeading />
          <p className="lede">Verificando sessão…</p>
        </section>
      </main>
    );
  }

  if (!authed) {
    return (
      <AdminGate
        onBack={onBack}
        onAuthed={() => setAuthed(true)}
      />
    );
  }

  const rooms = data?.rooms ?? [];
  const connectedUsers = data?.connectedUsers ?? [];
  const visitors = data?.visitors ?? [];

  return (
    <main className="overview">
      <LandingBlobs />
      <section className="overview-hero">
        <BrandHeading />
        <p className="lede">Salas ativas e quem está jogando agora.</p>
        {data ? (
          <div className="overview-stats">
            <span>
              <strong>{rooms.length}</strong> {rooms.length === 1 ? "sala ativa" : "salas ativas"}
            </span>
            <span>
              <strong>{connectedUsers.length}</strong>{" "}
              {connectedUsers.length === 1 ? "pessoa conectada" : "pessoas conectadas"}
            </span>
            <span>
              <strong>{visitors.length}</strong>{" "}
              {visitors.length === 1 ? "visitante em 30 dias" : "visitantes em 30 dias"}
            </span>
          </div>
        ) : null}
        {error ? <p className="hint landing-error">{error}</p> : null}

        <section className="overview-card">
          <h2>Pessoas conectadas</h2>
          {!data ? (
            <p className="overview-empty">Carregando…</p>
          ) : connectedUsers.length === 0 ? (
            <p className="overview-empty">Ninguém online no momento.</p>
          ) : (
            <ul className="overview-users">
              {connectedUsers.map((user) => (
                <li key={`${user.roomId}-${user.id}`}>
                  <button type="button" onClick={() => onEnter(user.roomId)}>
                    <span className="avatar sm" style={{ background: avatarColor(user.nickname) }}>
                      <PersonIcon />
                    </span>
                    <span className="overview-user-meta">
                      <strong>
                        {user.nickname}
                        {user.isAdmin ? <span className="admin-mark">Admin</span> : null}
                      </strong>
                      <small>Sala {user.roomId}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overview-card">
          <h2>Últimos 30 dias</h2>
          {!data ? (
            <p className="overview-empty">Carregando…</p>
          ) : (
            <>
              <p className="overview-empty">
                {visitors.length === 0
                  ? "Ninguém entrou em uma sala neste período."
                  : visitors.length === 1
                    ? "1 visitante gravado no banco."
                    : `${visitors.length} visitantes gravados no banco.`}
              </p>
              <button type="button" className="btn wide overview-card-btn" onClick={onShowVisitors}>
                Ver lista paginada
              </button>
            </>
          )}
        </section>

        <section className="overview-card">
          <h2>Salas ativas</h2>
          {!data ? (
            <p className="overview-empty">Carregando…</p>
          ) : rooms.length === 0 ? (
            <p className="overview-empty">Nenhuma sala aberta. Crie uma no início.</p>
          ) : (
            <ul className="overview-rooms">
              {rooms.map((room) => (
                <RoomCard key={room.roomId} room={room} onEnter={onEnter} />
              ))}
            </ul>
          )}
        </section>

        <div className="overview-foot">
          <button type="button" className="linkish" onClick={() => void logout()}>
            Sair
          </button>
          <a className="linkish" href="/ultimos-30-dias" onClick={(event) => {
            event.preventDefault();
            onShowVisitors();
          }}>
            Últimos 30 dias
          </a>
          <a className="linkish overview-back" href="/" onClick={(event) => {
            event.preventDefault();
            onBack();
          }}>
            Voltar ao início
          </a>
        </div>
      </section>
    </main>
  );
}

function roomCountLabel(room: OverviewRoom) {
  if (room.playerCount === 0) return "Esperando jogadores";
  if (room.connectedCount === room.playerCount) {
    return room.playerCount === 1 ? "1 pessoa online" : `${room.playerCount} pessoas online`;
  }
  return `${room.connectedCount} de ${room.playerCount} online`;
}

function RoomCard({
  room,
  onEnter,
}: {
  room: OverviewRoom;
  onEnter: (roomId: string) => void;
}) {
  return (
    <li className="overview-room">
      <div className="overview-room-head">
        <strong>{room.roomId}</strong>
        <span className={`overview-phase phase-${room.phase}`}>{PHASE_LABEL[room.phase]}</span>
      </div>
      <p className="overview-room-count">{roomCountLabel(room)}</p>
      {room.players.length === 0 ? (
        <p className="overview-empty">Sala vazia, esperando jogadores.</p>
      ) : (
        <ul className="overview-room-players">
          {room.players.map((player) => (
            <li key={player.id} className={player.connected ? "" : "offline"}>
              <span className={`avatar sm ${player.connected ? "" : "offline"}`} style={{ background: avatarColor(player.nickname) }}>
                <PersonIcon />
              </span>
              <span>
                {player.nickname}
                {player.isAdmin ? " · admin" : ""}
                {player.connected ? "" : " (offline)"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn wide" onClick={() => onEnter(room.roomId)}>
        Entrar na sala
      </button>
    </li>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 19.5c.6-3.6 3.4-6 7-6s6.4 2.4 7 6" />
    </svg>
  );
}
