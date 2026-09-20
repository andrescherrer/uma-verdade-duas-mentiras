import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Socket } from "socket.io-client";
import {
  C2S,
  S2C,
  VOTE_SECONDS_OPTIONS,
  type ErrorPayload,
  type JoinedPayload,
  type PublicPlayer,
  type PublicState,
  type RankingEntry,
  type VoteSeconds,
} from "../../shared/protocol.ts";
import { BrandHeading, InfoNote, LandingBlobs } from "./Landing";
import Sidebar from "./Sidebar";
import Timer from "./Timer";
import { avatarColor } from "./avatar";
import { getSocket, joinRoom, sessionKey } from "./socket";
import SessionImage from "./SessionImage";

const LETTERS = ["A", "B", "C"];

export default function Room({
  roomId,
  onShowAllGames,
}: {
  roomId: string;
  onShowAllGames: () => void;
}) {
  const socket = useMemo(() => getSocket(), []);
  const [nickname, setNickname] = useState(localStorage.getItem("vm.nickname") ?? "");
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState("");
  const [kicked, setKicked] = useState(false);
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(""), 4200);
    return () => window.clearTimeout(id);
  }, [error]);

  useEffect(() => {
    const onState = (next: PublicState) => setState(next);
    const onJoined = (payload: JoinedPayload) => {
      localStorage.setItem(sessionKey(payload.roomId), payload.sessionToken);
      setJoined(true);
      setKicked(false);
    };
    const onError = (payload: ErrorPayload) => setError(payload.message);
    const onKicked = () => {
      localStorage.removeItem(sessionKey(roomId));
      setKicked(true);
      setJoined(false);
      setState(null);
    };
    const onConnect = () => {
      setConnected(true);
      reconnectIfPossible();
    };
    const onDisconnect = () => setConnected(false);

    socket.on(S2C.STATE, onState);
    socket.on(S2C.JOINED, onJoined);
    socket.on(S2C.ERROR, onError);
    socket.on(S2C.KICKED, onKicked);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    reconnectIfPossible();
    return () => {
      socket.off(S2C.STATE, onState);
      socket.off(S2C.JOINED, onJoined);
      socket.off(S2C.ERROR, onError);
      socket.off(S2C.KICKED, onKicked);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };

    function reconnectIfPossible() {
      const token = localStorage.getItem(sessionKey(roomId));
      const autoJoin = sessionStorage.getItem("vm.autoJoin") === roomId;
      if (!token && !autoJoin) return;
      sessionStorage.removeItem("vm.autoJoin");
      const name = localStorage.getItem("vm.nickname") || "Jogador";
      joinRoom(roomId, name);
    }
  }, [roomId, socket]);

  function enter(event: FormEvent) {
    event.preventDefault();
    const name = nickname.trim();
    if (!name) {
      setError("Digite seu nome completo para entrar.");
      return;
    }
    localStorage.setItem("vm.nickname", name);
    joinRoom(roomId, name);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(state?.roomId ?? roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (kicked) {
    return (
      <main className="gate">
        <section className="hero">
          <h1>Você saiu da sala</h1>
          <p className="lede">Alguém removeu esta sessão. Entre de novo se ainda quiser jogar.</p>
          <a className="btn wide" href="/">Voltar ao início</a>
        </section>
      </main>
    );
  }

  if (!joined || !state) {
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
          <form className="landing-card" onSubmit={enter}>
            <h2>Entrar em uma sala</h2>
            <label htmlFor="nick">Seu nome (ou nickname)</label>
            <input
              id="nick"
              className="field"
              maxLength={24}
              minLength={2}
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Fulano da Silva"
            />
            <button className="btn wide" type="submit">Entrar na sala</button>
          </form>
          {error ? <p className="hint landing-error">{error}</p> : null}
          <InfoNote />
        </section>
      </main>
    );
  }

  const you = state.players.find((p) => p.isYou);
  const youAreAdmin = Boolean(you?.isAdmin);
  const hideSidebar = state.phase === "finished";
  const showScores = state.showRanking || state.phase === "finished";

  return (
    <div className={`room-shell ${hideSidebar ? "finish-mode" : ""}`}>
      {state.phase === "finished" ? (
        <Finished state={state} youAreAdmin={youAreAdmin} socket={socket} />
      ) : (
        <div className="room-frame">
          <header className="room-head">
            <div className="brand-lockup" onDoubleClick={onShowAllGames}>
              Uma Verdade <span className="accent">e Duas Mentiras</span>
            </div>
            <div className="room-head-actions">
              {!connected ? <span className="reconnect">Reconectando…</span> : null}
              <span className="room-pill">Sala: {state.roomId}</span>
              <button className="head-icon" onClick={copyCode} title="Copiar código">
                {copied ? "✓" : <CopyIcon />}
              </button>
              <button className="menu-btn" onClick={() => setSidebarOpen((v) => !v)}>Pessoas</button>
            </div>
          </header>
          <div className="room-body">
            <section className="stage-card">
              {state.phase === "lobby" && (
                <Lobby
                  state={state}
                  youAreAdmin={youAreAdmin}
                  socket={socket}
                  copied={copied}
                  onCopy={copyCode}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )}
              {state.phase === "preparation" && (
                <Preparation state={state} youAreAdmin={youAreAdmin} socket={socket} />
              )}
              {state.phase === "voting" && <Voting state={state} socket={socket} />}
              {state.phase === "reveal" && <Reveal state={state} youAreAdmin={youAreAdmin} socket={socket} />}
            </section>
            <Sidebar
              open={sidebarOpen}
              players={state.players}
              ranking={state.ranking}
              phase={state.phase}
              showScores={showScores}
              onSelect={(player) => {
                setSelected(player);
                setSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {settingsOpen && youAreAdmin ? (
        <SettingsModal
          state={state}
          socket={socket}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {selected ? (
        <div className="modal-back" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{selected.nickname}</h3>
              <button className="close-x" onClick={() => setSelected(null)}>×</button>
            </div>
            <p className="hint">
              {selected.connected ? "Conectado agora." : "Ausente — pode ter fechado o navegador."}{" "}
              {selected.isAdmin ? "É o administrador da sala." : ""}
            </p>
            <div className="actions" style={{ marginTop: 16, justifyContent: "flex-start" }}>
              {youAreAdmin && !selected.isYou ? (
                <>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      socket.emit(C2S.SET_ADMIN, { playerId: selected.id });
                      setSelected(null);
                    }}
                  >
                    Transferir administração
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      socket.emit(C2S.KICK, { playerId: selected.id });
                      setSelected(null);
                    }}
                  >
                    Remover da sala
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="toast">{error}</div> : null}
    </div>
  );
}

function Lobby({
  state,
  youAreAdmin,
  socket,
  copied,
  onCopy,
  onOpenSettings,
}: {
  state: PublicState;
  youAreAdmin: boolean;
  socket: Socket;
  copied: boolean;
  onCopy: () => void;
  onOpenSettings: () => void;
}) {
  const connected = state.players.filter((p) => p.connected).length;
  const admin = state.players.find((p) => p.isAdmin);
  const canStart = connected >= 2;
  return (
    <div className="welcome">
      <h2>Bem-vindo à sala!</h2>
      <p className="lede">
        Compartilhe o código com sua equipe
        <br />
        para começarem a jogar.
      </p>
      <div className="code-box">
        <strong>{state.roomId}</strong>
        <button className="icon-btn" onClick={onCopy} title="Copiar código">
          {copied ? "✓" : <CopyIcon />}
        </button>
      </div>
      <CrowdArt />
      <p className="wait-box">
        Aguarde mais participantes para iniciar o jogo.
        <br />
        O administrador pode iniciar quando todos estiverem prontos.
      </p>
      <p className="fun-line">
        <MiniBurst />
        Quanto mais gente, mais divertido!
        <MiniBurst className="flip" />
      </p>
      {youAreAdmin ? (
        <div className="lobby-actions">
          <button
            className="btn wide"
            disabled={!canStart}
            onClick={() => socket.emit(C2S.START_PREP)}
          >
            Iniciar preparação
          </button>
          <button className="settings-link" onClick={onOpenSettings} type="button">
            <GearIcon /> Configurações da sala
          </button>
        </div>
      ) : (
        <p className="hint">
          Aguardando {admin?.nickname ?? "o administrador"} iniciar a preparação.
        </p>
      )}
    </div>
  );
}

function SettingsModal({
  state,
  socket,
  onClose,
}: {
  state: PublicState;
  socket: Socket;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState<VoteSeconds>(state.voteSeconds);
  const [allowJoin, setAllowJoin] = useState(state.allowJoinDuringGame);
  const [autoEnd, setAutoEnd] = useState(state.autoEndRound);
  const [showRanking, setShowRanking] = useState(state.showRanking);
  const [adminId, setAdminId] = useState(state.players.find((p) => p.isAdmin)?.id ?? "");
  const [kickId, setKickId] = useState("");
  const [panel, setPanel] = useState<"admin" | "kick" | null>(null);
  const others = state.players.filter((p) => !p.isYou);

  function save() {
    socket.emit(C2S.SET_SETTINGS, {
      seconds,
      allowJoinDuringGame: allowJoin,
      autoEndRound: autoEnd,
      showRanking,
    });
    if (adminId && adminId !== state.players.find((p) => p.isAdmin)?.id) {
      socket.emit(C2S.SET_ADMIN, { playerId: adminId });
    }
    if (kickId) socket.emit(C2S.KICK, { playerId: kickId });
    onClose();
  }

  function togglePanel(next: "admin" | "kick") {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Configurações da sala</h3>
          <button className="close-x light" onClick={onClose} type="button">×</button>
        </div>
        <label htmlFor="vote-seconds">Tempo de votação por rodada</label>
        <div className="select-wrap">
          <select
            id="vote-seconds"
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value) as VoteSeconds)}
          >
            {VOTE_SECONDS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option} segundos</option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div>
            <strong>Permitir entrada durante o jogo</strong>
            <p>Novos participantes entram como espectadores.</p>
          </div>
          <button className={`toggle ${allowJoin ? "on" : ""}`} onClick={() => setAllowJoin((v) => !v)} type="button">
            <i />
          </button>
        </div>
        <div className="setting">
          <div>
            <strong>Encerrar rodada automaticamente quando todos votarem</strong>
          </div>
          <button className={`toggle ${autoEnd ? "on" : ""}`} onClick={() => setAutoEnd((v) => !v)} type="button">
            <i />
          </button>
        </div>
        <div className="setting">
          <div>
            <strong>Mostrar ranking durante o jogo</strong>
          </div>
          <button className={`toggle ${showRanking ? "on" : ""}`} onClick={() => setShowRanking((v) => !v)} type="button">
            <i />
          </button>
        </div>
        <div className="manage">
          <h3>Gerenciamento da sala</h3>
          <button
            type="button"
            className={`manage-btn ${panel === "admin" ? "open" : ""}`}
            onClick={() => togglePanel("admin")}
          >
            <TransferIcon /> Transferir administração
          </button>
          {panel === "admin" ? (
            <select className="manage-select" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              {state.players.map((p) => (
                <option key={p.id} value={p.id}>{p.nickname}{p.isAdmin ? " (admin)" : ""}</option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className={`manage-btn ${panel === "kick" ? "open" : ""}`}
            onClick={() => togglePanel("kick")}
          >
            <TrashIcon /> Remover participante
          </button>
          {panel === "kick" ? (
            <select className="manage-select" value={kickId} onChange={(e) => setKickId(e.target.value)}>
              <option value="">Escolher participante</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>{p.nickname}</option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="settings-foot">
          <button className="btn" onClick={save} type="button">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function Preparation({
  state,
  youAreAdmin,
  socket,
}: {
  state: PublicState;
  youAreAdmin: boolean;
  socket: Socket;
}) {
  const allReady = state.pendingNicknames.length === 0 && state.players.length >= 2;
  if (state.you?.prepared && allReady) {
    return (
      <div className="ready">
        <ReadyArt />
        <h2>Todos prontos!</h2>
        <p className="lede">O administrador já pode iniciar o jogo.</p>
        {youAreAdmin ? (
          <button className="btn" onClick={() => socket.emit(C2S.START_GAME)}>Iniciar jogo</button>
        ) : (
          <p className="hint">Aguardando o administrador iniciar o jogo.</p>
        )}
      </div>
    );
  }
  if (state.you?.prepared) {
    return (
      <div className="ready">
        <ReadyArt />
        <h2>Afirmações salvas</h2>
        <p className="lede">Aguardando: {state.pendingNicknames.join(", ")}</p>
      </div>
    );
  }

  return <PrepForm state={state} socket={socket} />;
}

function PrepForm({ state, socket }: { state: PublicState; socket: Socket }) {
  const existing = state.you?.statements;
  const [truth, setTruth] = useState(existing?.find((s) => s.kind === "truth")?.text ?? "");
  const [lie1, setLie1] = useState(existing?.filter((s) => s.kind === "lie")[0]?.text ?? "");
  const [lie2, setLie2] = useState(existing?.filter((s) => s.kind === "lie")[1]?.text ?? "");
  const [truthImage, setTruthImage] = useState<string | null>(existing?.find((s) => s.kind === "truth")?.imageId ?? null);
  const [lie1Image, setLie1Image] = useState<string | null>(existing?.filter((s) => s.kind === "lie")[0]?.imageId ?? null);
  const [lie2Image, setLie2Image] = useState<string | null>(existing?.filter((s) => s.kind === "lie")[1]?.imageId ?? null);
  const [saving, setSaving] = useState(false);

  async function upload(file: File, setter: (id: string) => void) {
    const token = localStorage.getItem(sessionKey(state.roomId));
    const body = new FormData();
    body.append("image", file);
    const res = await fetch(`/api/rooms/${state.roomId}/images`, {
      method: "POST",
      headers: { "x-session-token": token ?? "" },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Falha no upload");
    setter(data.imageId);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    socket.emit(C2S.SUBMIT_PREP, {
      truth: { text: truth, imageId: truthImage },
      lie1: { text: lie1, imageId: lie1Image },
      lie2: { text: lie2, imageId: lie2Image },
    });
    setTimeout(() => setSaving(false), 400);
  }

  return (
    <div>
      <div className="prep-head">
        <h2>Agora é a sua vez, {state.you?.nickname}!</h2>
        <p className="lede">Preencha suas três afirmações.</p>
      </div>
      <form className="prep-grid" onSubmit={submit}>
        <StatementField
          label="Qual é a verdade sobre você?"
          placeholder="Já morei em outro país."
          value={truth}
          onChange={setTruth}
          imageId={truthImage}
          roomId={state.roomId}
          onFile={(file) => upload(file, setTruthImage)}
          onClear={() => setTruthImage(null)}
        />
        <StatementField
          label="Qual é uma mentira sobre você?"
          placeholder="Tenho medo de borboletas."
          value={lie1}
          onChange={setLie1}
          imageId={lie1Image}
          roomId={state.roomId}
          onFile={(file) => upload(file, setLie1Image)}
          onClear={() => setLie1Image(null)}
        />
        <StatementField
          label="Qual é outra mentira sobre você?"
          placeholder="Já pulei de paraquedas."
          value={lie2}
          onChange={setLie2}
          imageId={lie2Image}
          roomId={state.roomId}
          onFile={(file) => upload(file, setLie2Image)}
          onClear={() => setLie2Image(null)}
        />
        <button className="btn wide" disabled={saving} type="submit">
          Salvar minhas afirmações
        </button>
      </form>
      {state.you?.prepared && state.pendingNicknames.length > 0 ? (
        <p className="hint" style={{ marginTop: 14 }}>
          Aguardando: {state.pendingNicknames.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function StatementField({
  label,
  placeholder,
  value,
  onChange,
  imageId,
  roomId,
  onFile,
  onClear,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  imageId: string | null;
  roomId: string;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="prep-item">
      <label>{label}</label>
      <div className="prep-row">
        <input
          className="prep-input"
          maxLength={220}
          minLength={3}
          required
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {imageId ? (
          <span className="thumb-wrap">
            <SessionImage className="thumb" imageId={imageId} roomId={roomId} />
            <button type="button" className="thumb-x" onClick={onClear} aria-label="Remover imagem">
              ×
            </button>
          </span>
        ) : null}
      </div>
      <label className="add-image">
        <CameraIcon /> Adicionar imagem (opcional)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function Voting({ state, socket }: { state: PublicState; socket: Socket }) {
  const isSubject = state.subject?.id === state.you?.id;
  const locked = Boolean(state.myVote) || isSubject;
  const progress = state.roundTotal > 0 ? (state.roundNumber / state.roundTotal) * 100 : 0;
  return (
    <div className="vote-screen">
      <div className="vote-top">
        <div className="round-progress">
          <span>Rodada {state.roundNumber} de {state.roundTotal}</span>
          <div className="round-bar" aria-hidden>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
        <Timer endsAt={state.voteEndsAt} serverNow={state.serverNow} />
      </div>
      <h2 className="question">Qual dessas afirmações é a verdade sobre {state.subject?.nickname}?</h2>
      <div className="choices">
        {state.options.map((option, index) => (
          <button
            key={option.id}
            className={`choice ${state.myVote === option.id ? "selected" : ""}`}
            disabled={locked}
            onClick={() => socket.emit(C2S.VOTE, { statementId: option.id })}
          >
            <span className="letter">{LETTERS[index] ?? index + 1}</span>
            <span>{option.text}</span>
          </button>
        ))}
      </div>
      {isSubject ? (
        <div className="vote-note">
          <div>
            <strong>Você está na vez.</strong>
            <p>Os outros estão votando. As imagens ficam escondidas até a revelação.</p>
          </div>
        </div>
      ) : state.myVote ? (
        <div className="vote-note">
          <LockIcon />
          <div>
            <strong>Você já enviou sua resposta!</strong>
            <p>Aguarde o tempo terminar para ver o resultado.</p>
          </div>
        </div>
      ) : (
        <div className="vote-note quiet">
          <div>
            <strong>{state.votedCount} de {state.eligibleCount} votos enviados.</strong>
            <p>Escolha a afirmação que você acha verdadeira.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Reveal({
  state,
  youAreAdmin,
  socket,
}: {
  state: PublicState;
  youAreAdmin: boolean;
  socket: Socket;
}) {
  const truth = state.options.find((o) => o.kind === "truth");
  const lies = state.options.filter((o) => o.kind === "lie");
  const progress = state.roundTotal > 0 ? (state.roundNumber / state.roundTotal) * 100 : 0;
  const correctCount = state.reveal?.correctCount ?? 0;
  const wrongCount = state.reveal?.wrongCount ?? 0;

  return (
    <div className="reveal-screen">
      <div className="vote-top">
        <div className="round-progress">
          <span>Rodada {state.roundNumber} de {state.roundTotal}</span>
          <div className="round-bar success" aria-hidden>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {truth ? (
        <article className="truth-hero">
          <ConfettiDots />
          <div className="truth-badge">
            <span className="truth-check">✓</span>
            A verdade era:
          </div>
          <div className={`truth-hero-body ${truth.imageId ? "has-image" : ""}`}>
            <h3>{truth.text}</h3>
            {truth.imageId ? (
              <SessionImage imageId={truth.imageId} roomId={state.roomId} alt="Prova da verdade" />
            ) : null}
          </div>
        </article>
      ) : null}

      <div className="lie-grid">
        {lies.map((lie) => (
          <article key={lie.id} className="lie-card">
            <div className="lie-head">
              <span className="lie-x">✕</span>
              <h3>{lie.text}</h3>
            </div>
            {lie.imageId ? <SessionImage imageId={lie.imageId} roomId={state.roomId} /> : null}
          </article>
        ))}
      </div>

      <div className="reveal-stats">
        <div className="stat-card ok">
          <span className="stat-icon ok">✓</span>
          <div>
            <strong>{correctCount}</strong>
            <span>acertaram</span>
          </div>
        </div>
        <div className="stat-card no">
          <span className="stat-icon no">✕</span>
          <div>
            <strong>{wrongCount}</strong>
            <span>erraram</span>
          </div>
        </div>
      </div>

      <div className="next-wrap">
        {youAreAdmin ? (
          <button className="btn" onClick={() => socket.emit(C2S.ADVANCE)}>Próxima rodada</button>
        ) : (
          <p className="hint">Aguardando o administrador avançar.</p>
        )}
      </div>
    </div>
  );
}

function Finished({
  state,
  youAreAdmin,
  socket,
}: {
  state: PublicState;
  youAreAdmin: boolean;
  socket: Socket;
}) {
  const scorers = state.ranking.filter((r) => r.score > 0);
  const nobodyWon = scorers.length === 0;
  const first = scorers.find((r) => r.rank === 1);
  const second = scorers.find((r) => r.rank === 2);
  const third = scorers.find((r) => r.rank === 3);
  const rest = state.ranking.filter((r) => r.rank > 3 || r.rank === 0);

  return (
    <section className="finish">
      <FinishConfetti />
      <p className="finish-brand">
        Uma Verdade <span>e Duas Mentiras</span>
      </p>
      {nobodyWon ? (
        <div className="trophy handshake" aria-hidden>🤝</div>
      ) : (
        <TrophyArt />
      )}
      <h2>Fim de jogo!</h2>
      {nobodyWon ? (
        <p className="lede">Ninguém pontuou. Sem vencedor desta vez.</p>
      ) : (
        <p className="lede">Confira o ranking final da equipe.</p>
      )}
      {nobodyWon ? (
        <div className="rest">
          {state.ranking.map((entry) => (
            <RestRow key={entry.playerId} entry={entry} />
          ))}
        </div>
      ) : (
        <>
          <div className="podium">
            <PodiumPlace place={2} entry={second} />
            <PodiumPlace place={1} entry={first} />
            <PodiumPlace place={3} entry={third} />
          </div>
          {rest.length > 0 ? (
            <div className="rest">
              {rest.map((entry) => (
                <RestRow key={entry.playerId} entry={entry} />
              ))}
            </div>
          ) : null}
        </>
      )}
      <div className="finish-actions">
        {youAreAdmin ? (
          <button className="btn" onClick={() => socket.emit(C2S.RESET)}>Jogar novamente</button>
        ) : null}
        <button
          className="btn exit"
          onClick={() => {
            socket.emit(C2S.LEAVE);
            localStorage.removeItem(sessionKey(state.roomId));
            window.location.href = "/";
          }}
        >
          Sair da sala
        </button>
      </div>
    </section>
  );
}

function PodiumPlace({ place, entry }: { place: 1 | 2 | 3; entry?: RankingEntry }) {
  return (
    <div className={`place p${place} ${entry ? "" : "empty"}`}>
      <div className="place-avatar">
        <MiniCrown />
        <span
          className="avatar"
          style={{ background: entry ? avatarColor(entry.nickname) : "#3a4568" }}
        >
          <PersonMark />
        </span>
      </div>
      <div className="place-rank">{place}º</div>
      <div className="name">{entry?.nickname ?? "—"}</div>
      <div className="pts">
        {entry ? `${entry.score} ${entry.score === 1 ? "ponto" : "pontos"}` : "—"}
      </div>
    </div>
  );
}

function RestRow({ entry }: { entry: RankingEntry }) {
  return (
    <div className="rest-row">
      <span className="rest-rank">{entry.rank > 0 ? `${entry.rank}º` : "—"}</span>
      <span className="avatar sm" style={{ background: avatarColor(entry.nickname) }}>
        <PersonMark />
      </span>
      <span className="rest-name">{entry.nickname}</span>
      <span className="rest-pts">{entry.score} {entry.score === 1 ? "ponto" : "pontos"}</span>
    </div>
  );
}

function TrophyArt() {
  return (
    <div className="trophy" aria-hidden>
      <svg viewBox="0 0 72 72" width="72" height="72">
        <path d="M18 16h36v10c0 12-8 22-18 22S18 38 18 26V16Z" fill="#e8b84a" />
        <path d="M18 20c-8 2-12 8-12 14 0 6 4 10 10 10" fill="none" stroke="#e8b84a" strokeWidth="5" />
        <path d="M54 20c8 2 12 8 12 14 0 6-4 10-10 10" fill="none" stroke="#e8b84a" strokeWidth="5" />
        <rect x="30" y="46" width="12" height="8" rx="2" fill="#d4a43a" />
        <rect x="24" y="54" width="24" height="6" rx="3" fill="#e8b84a" />
      </svg>
      <span className="trophy-num">1</span>
    </div>
  );
}

function FinishConfetti() {
  return (
    <svg className="finish-confetti" viewBox="0 0 400 120" aria-hidden>
      <rect x="36" y="18" width="8" height="18" rx="2" fill="#7b84f0" transform="rotate(-28 40 27)" />
      <rect x="70" y="48" width="7" height="16" rx="2" fill="#2ec36a" transform="rotate(18 74 56)" />
      <circle cx="58" cy="72" r="4" fill="#e8b84a" />
      <rect x="330" y="22" width="8" height="18" rx="2" fill="#e4458c" transform="rotate(24 334 31)" />
      <rect x="352" y="54" width="7" height="16" rx="2" fill="#7b84f0" transform="rotate(-16 356 62)" />
      <circle cx="318" cy="70" r="4" fill="#2ec36a" />
    </svg>
  );
}

function MiniCrown() {
  return (
    <svg className="mini-crown" viewBox="0 0 16 14" width="16" height="12" aria-hidden>
      <path d="M1.5 12.5h13l-1-8-3.5 3.2L8 1.5 6 7.7 2.5 4.5l-1 8Z" fill="#e8b84a" stroke="#e8b84a" strokeLinejoin="round" />
    </svg>
  );
}

function PersonMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 19.5c.6-3.6 3.4-6 7-6s6.4 2.4 7 6" />
    </svg>
  );
}

function CrowdArt() {
  return (
    <svg className="crowd" viewBox="0 0 240 130" aria-hidden>
      <g fill="#c1ccf2">
        <circle cx="62" cy="44" r="26" />
        <path d="M18 128c2-34 20-54 44-54s42 20 44 54H18Z" />
        <circle cx="178" cy="44" r="26" />
        <path d="M134 128c2-34 20-54 44-54s42 20 44 54h-88Z" />
        <circle cx="120" cy="36" r="30" />
        <path d="M70 128c2-38 22-62 50-62s48 24 50 62H70Z" />
      </g>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96c-.5-.4-1.04-.72-1.63-.94l-.36-2.54A.5.5 0 0 0 13.88 2h-3.76a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.5.4 1.04.72 1.63.94l.36 2.54c.06.24.26.42.5.42h3.76c.24 0 .44-.18.5-.42l.36-2.54c.59-.22 1.13-.54 1.63-.94l2.39.96c.19.12.47.02.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z" />
    </svg>
  );
}

function ConfettiDots() {
  return (
    <svg className="confetti" viewBox="0 0 360 56" aria-hidden>
      <circle cx="28" cy="22" r="4" fill="#7b84f0" />
      <rect x="52" y="8" width="7" height="7" rx="1.5" fill="#2ec36a" transform="rotate(18 55 11)" />
      <circle cx="78" cy="34" r="3.5" fill="#f0c14d" />
      <circle cx="292" cy="16" r="4" fill="#2ec36a" />
      <rect x="318" y="28" width="7" height="7" rx="1.5" fill="#7b84f0" transform="rotate(-22 321 31)" />
      <circle cx="344" cy="12" r="3.5" fill="#e4458c" />
    </svg>
  );
}

function ReadyArt() {
  return (
    <svg className="ready-art" viewBox="0 0 140 140" aria-hidden>
      <g transform="rotate(-8 70 68)">
        <rect x="34" y="24" width="76" height="90" rx="16" fill="#e4eaff" />
        <rect x="50" y="46" width="44" height="7" rx="3.5" fill="#c5c9fb" />
        <rect x="50" y="62" width="44" height="7" rx="3.5" fill="#c5c9fb" />
        <rect x="50" y="78" width="30" height="7" rx="3.5" fill="#c5c9fb" />
      </g>
      <circle cx="96" cy="102" r="22" fill="#2ec36a" />
      <path
        d="M86 102.5 93 109.5 107 93.5"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.5 7.5 10 5.5h4L15.5 7.5H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 18c.4-2.8 2.4-4.5 5-4.5s4.6 1.7 5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 13.8c1.8 0 3.3.9 3.9 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 7l.8 12.2A1.5 1.5 0 0 0 10.3 20.5h3.4a1.5 1.5 0 0 0 1.5-1.3L16 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function MiniBurst({ className = "" }: { className?: string }) {
  return (
    <svg className={`mini-burst ${className}`} viewBox="0 0 28 28" fill="none" aria-hidden>
      <g stroke="#b07edf" strokeWidth="3.4" strokeLinecap="round">
        <path d="M16 16 L6 5" />
        <path d="M16 16 L4 14" />
        <path d="M16 16 L14 4" />
      </g>
    </svg>
  );
}
