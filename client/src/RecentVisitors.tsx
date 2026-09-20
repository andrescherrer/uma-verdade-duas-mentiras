import { useEffect, useState } from "react";
import type { VisitorRecord, VisitorsPagePayload } from "../../shared/protocol.ts";
import { VISITORS_PAGE_SIZE } from "../../shared/protocol.ts";
import { AdminGate, adminLogout, fetchAdminSession } from "./AdminGate";
import { BrandHeading, LandingBlobs } from "./Landing";

function pageFromSearch(): number {
  const page = Number(new URLSearchParams(window.location.search).get("page") ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function visitorsPath(page: number) {
  return page <= 1 ? "/ultimos-30-dias" : `/ultimos-30-dias?page=${page}`;
}

export default function RecentVisitors({
  onBack,
  onShowAllGames,
}: {
  onBack: () => void;
  onShowAllGames: () => void;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, setPage] = useState(pageFromSearch);
  const [data, setData] = useState<VisitorsPagePayload | null>(null);
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
    const onPop = () => setPage(pageFromSearch());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/admin/visitors?page=${page}`, { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) {
            setAuthed(false);
            setData(null);
          }
          return;
        }
        if (!res.ok) throw new Error("Falha ao carregar.");
        const payload = (await res.json()) as VisitorsPagePayload;
        if (!cancelled) {
          setData(payload);
          setError("");
          if (payload.page !== page) {
            window.history.replaceState({}, "", visitorsPath(payload.page));
            setPage(payload.page);
          }
        }
      } catch {
        if (!cancelled) setError("Não foi possível listar os visitantes agora.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authed, page]);

  function goToPage(next: number) {
    if (next === page) return;
    window.history.pushState({}, "", visitorsPath(next));
    setPage(next);
  }

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
        lede="Acesso restrito aos visitantes dos últimos 30 dias."
        note="Somente o administrador master pode ver esta lista."
        onAuthed={() => setAuthed(true)}
      />
    );
  }

  const visitors = data?.visitors ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const current = data?.page ?? page;

  return (
    <main className="overview">
      <LandingBlobs />
      <section className="overview-hero">
        <BrandHeading />
        <p className="lede">Usuários gravados nos últimos 30 dias.</p>
        {data ? (
          <div className="overview-stats">
            <span>
              <strong>{total}</strong> {total === 1 ? "visitante" : "visitantes"}
            </span>
            <span>
              <strong>{VISITORS_PAGE_SIZE}</strong> por página
            </span>
          </div>
        ) : null}
        {error ? <p className="hint landing-error">{error}</p> : null}

        <section className="overview-card">
          <h2>Lista de usuários</h2>
          {!data ? (
            <p className="overview-empty">Carregando…</p>
          ) : visitors.length === 0 ? (
            <p className="overview-empty">Ninguém entrou em uma sala neste período.</p>
          ) : (
            <>
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
              {totalPages > 1 ? (
                <nav className="pager" aria-label="Paginação dos visitantes">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={current <= 1}
                    onClick={() => goToPage(current - 1)}
                  >
                    Anterior
                  </button>
                  <p className="pager-status">
                    Página {current} de {totalPages}
                  </p>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={current >= totalPages}
                    onClick={() => goToPage(current + 1)}
                  >
                    Próxima
                  </button>
                </nav>
              ) : null}
            </>
          )}
        </section>

        <div className="overview-foot">
          <button type="button" className="linkish" onClick={() => void logout()}>
            Sair
          </button>
          <a className="linkish" href="/todas-os-jogos" onClick={(event) => {
            event.preventDefault();
            onShowAllGames();
          }}>
            Ver salas
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
