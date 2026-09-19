import { useState, type FormEvent, type ReactNode } from "react";

export default function Landing({
  onEnter,
  onShowAllGames,
}: {
  onEnter: (roomId: string) => void;
  onShowAllGames: () => void;
}) {
  const [nickname, setNickname] = useState(localStorage.getItem("vm.nickname") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function saveName() {
    const name = nickname.trim();
    if (!name) {
      setError("Escolha um nome para entrar.");
      return false;
    }
    localStorage.setItem("vm.nickname", name);
    return true;
  }

  function goToRoom(roomId: string) {
    sessionStorage.setItem("vm.autoJoin", roomId.toUpperCase());
    onEnter(roomId);
  }

  async function createRoom() {
    if (!saveName()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Não foi possível criar a sala.");
      goToRoom(data.roomId);
    } catch {
      setError("Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  }

  function joinExisting(event: FormEvent) {
    event.preventDefault();
    if (!saveName()) return;
    const roomId = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(roomId)) {
      setError("Informe o código da sala.");
      return;
    }
    goToRoom(roomId);
  }

  return (
    <main className="landing">
      <LandingBlobs />
      <section className="landing-hero">
        <BrandHeading onDoubleClick={onShowAllGames} />
        <p className="lede">
          Descubra o que é verdade sobre
          <br />
          seus colegas!
        </p>
        <form className="landing-card" onSubmit={joinExisting}>
          <h2>Entrar em uma sala</h2>
          <label htmlFor="nick">Seu nome (ou nickname)</label>
          <input
            id="nick"
            className="field"
            maxLength={24}
            minLength={2}
            autoComplete="nickname"
            placeholder="Fulano da Silva"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <label htmlFor="code">Código da sala</label>
          <input
            id="code"
            className="field"
            placeholder="X7K9"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn wide" type="submit" disabled={busy}>
            Entrar na sala
          </button>
          <button type="button" className="linkish" disabled={busy} onClick={createRoom}>
            Ou criar uma nova sala
          </button>
          <a className="linkish overview-link" href="/todas-os-jogos" onClick={(event) => {
            event.preventDefault();
            onShowAllGames();
          }}>
            Ver todas as salas
          </a>
        </form>
        {error ? <p className="hint landing-error">{error}</p> : null}
        <InfoNote />
      </section>
    </main>
  );
}

export function LandingBlobs() {
  return (
    <div className="landing-blobs" aria-hidden>
      <span className="blob blob-a" />
      <span className="blob blob-b" />
      <span className="blob blob-c" />
    </div>
  );
}

export function BrandHeading({ onDoubleClick }: { onDoubleClick?: () => void }) {
  return (
    <div className="brand-heading" onDoubleClick={onDoubleClick}>
      <Burst className="burst burst-left" />
      <h1 className="brand-title">
        <span>Uma Verdade</span>
        <span>
          e Duas <em>Mentiras</em>
        </span>
      </h1>
      <Burst className="burst burst-right" />
    </div>
  );
}

export function InfoNote({ children }: { children?: ReactNode }) {
  return (
    <p className="info-note">
      <span className="info-i" aria-hidden>
        i
      </span>
      <span>
        {children ?? (
          <>
            Sem login, sem complicação.
            <br />
            É só entrar e jogar!
          </>
        )}
      </span>
    </p>
  );
}

function Burst({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden>
      <g stroke="#b07edf" strokeWidth="4.6" strokeLinecap="round">
        <path d="M22 22 L7 6" />
        <path d="M22 22 L4 18" />
        <path d="M22 22 L20 4" />
      </g>
    </svg>
  );
}
