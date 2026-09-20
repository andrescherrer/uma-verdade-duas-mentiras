import { useState, type FormEvent } from "react";
import { BrandHeading, InfoNote, LandingBlobs } from "./Landing";

export function AdminGate({
  onAuthed,
  onBack,
  lede = "Acesso restrito ao painel de salas.",
  note = "Somente o administrador master pode ver as salas ativas.",
}: {
  onAuthed: () => void;
  onBack: () => void;
  lede?: string;
  note?: string;
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { message?: string; ok?: boolean };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.message ?? "Usuário ou senha inválidos.");
      }
      onAuthed();
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
        <p className="lede">{lede}</p>
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
        <InfoNote>{note}</InfoNote>
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

export async function fetchAdminSession(): Promise<boolean> {
  const res = await fetch("/api/admin/session", { credentials: "include" });
  if (!res.ok) return false;
  const payload = (await res.json()) as { authenticated?: boolean };
  return Boolean(payload.authenticated);
}

export async function adminLogout(): Promise<void> {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}
