import { useEffect, useState, type FormEvent } from "react";
import type { OverviewPayload, OverviewRoom, Phase, VisitorRecord } from "../../shared/protocol.ts";
import { BrandHeading, InfoNote, LandingBlobs } from "./Landing";
import { avatarColor } from "./avatar";

const ADMIN_TOKEN_KEY = "vm.adminToken";

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
}: {
  onEnter: (roomId: string) => void;
  onBack: () => void;
}) {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState("");

  function clearSession() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setData(null);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/rooms", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          if (!cancelled) clearSession();
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
  }, [token]);

  async function logout() {
    if (token) {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    clearSession();
  }

  if (!token) {
    return <AdminGate onBack={onBack} onAuthed={(next) => {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, next);
      setToken(next);
    }} />;
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
          <h2>Visitantes dos últimos 30 dias</h2>
          {!data ? (
            <p className="overview-empty">Carregando…</p>
          ) : visitors.length === 0 ? (
            <p className="overview-empty">Ninguém entrou em uma sala neste período.</p>
          ) : (
            <div className="overview-table-wrap">
              <table className="overview-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>IP</th>
                    <th>Local</th>
                    <th>Última visita</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((visitor) => (
                    <VisitorRow key={`${visitor.ip}-${visitor.nickname}`} visitor={visitor} />
                  ))}
                </tbody>
              </table>
            </div>
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

function AdminGate({
  onAuthed,
  onBack,
}: {
  onAuthed: (token: string) => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { message?: string; token?: string };
      if (!res.ok || typeof payload.token !== "string") {
        throw new Error(payload.message ?? "Usuário ou senha inválidos.");
      }
      onAuthed(payload.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuário ou senha inválidos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <LandingBlobs />
      <section className="landing-hero">
        <BrandHeading />
        <p className="lede">Acesso restrito ao painel de salas.</p>
        <form className="landing-card" onSubmit={(event) => void submit(event)}>
          <h2>Entrar como admin</h2>
          <label htmlFor="admin-user">Usuário</label>
          <input
            id="admin-user"
            className="field"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label htmlFor="admin-pass">Senha</label>
          <input
            id="admin-pass"
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn wide" type="submit" disabled={busy}>
            Entrar
          </button>
        </form>
        {error ? <p className="hint landing-error">{error}</p> : null}
        <InfoNote>Somente o administrador master pode ver as salas ativas.</InfoNote>
        <a className="linkish overview-back" href="/" onClick={(event) => {
          event.preventDefault();
          onBack();
        }}>
          Voltar ao início
        </a>
      </section>
    </main>
  );
}

function VisitorRow({ visitor }: { visitor: VisitorRecord }) {
  return (
    <tr>
      <td>
        <strong>{visitor.nickname}</strong>
        {visitor.roomId ? <small>Sala {visitor.roomId}</small> : null}
      </td>
      <td><code>{visitor.ip}</code></td>
      <td>{visitor.location}</td>
      <td>{formatWhen(visitor.lastSeenAt)}</td>
    </tr>
  );
}

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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
