import { useEffect, useState, type ReactNode } from "react";
import { BrandHeading, LandingBlobs } from "./Landing";

const STEPS = [
  "ideia",
  "entrar",
  "sala",
  "preparacao",
  "votacao",
  "revelacao",
  "ranking",
] as const;

export default function HowToPlay({ onBack }: { onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const last = STEPS.length - 1;

  useEffect(() => {
    const previous = document.title;
    document.title = "Como jogar — Uma Verdade e Duas Mentiras";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onBack();
        return;
      }
      if (event.key === "Home") {
        setIndex(0);
        return;
      }
      if (event.key === "End") {
        setIndex(last);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((i) => Math.min(last, i + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onBack]);

  const step = STEPS[index];

  return (
    <main className="deck">
      <LandingBlobs />
      <header className="deck-bar">
        <button className="linkish" type="button" onClick={onBack}>
          Voltar
        </button>
        <span className="deck-progress">
          {index + 1} / {STEPS.length}
        </span>
      </header>

      <section className="deck-slide" key={step} aria-live="polite">
        {step === "ideia" && <IdeaSlide />}
        {step === "entrar" && <EnterSlide />}
        {step === "sala" && <LobbySlide />}
        {step === "preparacao" && <PrepSlide />}
        {step === "votacao" && <VoteSlide />}
        {step === "revelacao" && <RevealSlide />}
        {step === "ranking" && <FinishSlide />}
      </section>

      <nav className="deck-nav" aria-label="Slides">
        <button
          className="deck-arrow"
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          Anterior
        </button>
        <div className="deck-dots">
          {STEPS.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`deck-dot ${i === index ? "on" : ""}`}
              aria-label={`Ir para o passo ${i + 1}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        {index === last ? (
          <button className="btn" type="button" onClick={onBack}>
            Ir jogar
          </button>
        ) : (
          <button className="btn" type="button" onClick={() => setIndex((i) => i + 1)}>
            Próximo
          </button>
        )}
      </nav>
    </main>
  );
}

function Lesson({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="deck-lesson">
      <p className="deck-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function IdeaSlide() {
  return (
    <div className="deck-cover">
      <BrandHeading />
      <p className="lede">Como jogar em poucos minutos</p>
      <div className="deck-idea-grid">
        <article className="deck-idea truth">
          <span>1 verdade</span>
          <strong>Algo real sobre você</strong>
        </article>
        <article className="deck-idea lie">
          <span>2 mentiras</span>
          <strong>Histórias convincentes</strong>
        </article>
        <article className="deck-idea vote">
          <span>O grupo vota</span>
          <strong>Quem acerta, pontua</strong>
        </article>
      </div>
      <p className="deck-tip">
        Sem cadastro. Cada pessoa da sala vira o assunto de uma rodada.
        Use as setas do teclado para avançar.
      </p>
    </div>
  );
}

function EnterSlide() {
  return (
    <>
      <Lesson kicker="Tela inicial" title="Entre com o nome e o código da sala">
        <ul>
          <li>Escreva o nome que a equipe vai ver.</li>
          <li>Use o código que alguém compartilhou.</li>
          <li>Se ninguém criou ainda, abra uma sala nova.</li>
        </ul>
      </Lesson>
      <Preview>
        <div className="deck-mock landing">
          <section className="landing-hero">
            <p className="brand-lockup mock-brand">
              Uma Verdade <span className="accent">e Duas Mentiras</span>
            </p>
            <form className="landing-card" onSubmit={(e) => e.preventDefault()}>
              <h2>Entrar em uma sala</h2>
              <label>Seu nome (ou nickname)</label>
              <input className="field" readOnly tabIndex={-1} value="Carla" />
              <label>Código da sala</label>
              <input className="field" readOnly tabIndex={-1} value="X7K9" />
              <button className="btn wide" type="button" tabIndex={-1}>
                Entrar na sala
              </button>
              <span className="linkish">Ou criar uma nova sala</span>
            </form>
          </section>
        </div>
      </Preview>
    </>
  );
}

function LobbySlide() {
  return (
    <>
      <Lesson kicker="Sala de espera" title="Reúnam a equipe e comecem">
        <ul>
          <li>O código grande é o convite da sala.</li>
          <li>Precisa de pelo menos 2 pessoas conectadas.</li>
          <li>Quem administra a sala inicia a preparação.</li>
        </ul>
      </Lesson>
      <Preview>
        <RoomChrome code="X7K9" people={lobbyPeople}>
          <div className="welcome">
            <h2>Bem-vindo à sala!</h2>
            <p className="lede">
              Compartilhe o código com sua equipe
              <br />
              para começarem a jogar.
            </p>
            <div className="code-box">
              <strong>X7K9</strong>
            </div>
            <CrowdArt />
            <p className="wait-box">
              Aguarde mais participantes para iniciar o jogo.
              <br />
              O administrador pode iniciar quando todos estiverem prontos.
            </p>
            <button className="btn wide" type="button" tabIndex={-1}>
              Iniciar preparação
            </button>
          </div>
        </RoomChrome>
      </Preview>
    </>
  );
}

function PrepSlide() {
  return (
    <>
      <Lesson kicker="Preparação" title="Escreva uma verdade e duas mentiras">
        <ul>
          <li>A verdade precisa ser real. As mentiras, críveis.</li>
          <li>Imagem é opcional — só aparece na revelação.</li>
          <li>Quando todos salvam, o jogo pode começar.</li>
        </ul>
      </Lesson>
      <Preview>
        <RoomChrome code="X7K9" people={prepPeople}>
          <div className="prep-head">
            <h2>Agora é a sua vez, Carla!</h2>
            <p className="lede">Preencha suas três afirmações.</p>
          </div>
          <div className="prep-grid">
            <FakeField label="Qual é a verdade sobre você?" value="Já morei em outro país." />
            <FakeField label="Qual é uma mentira sobre você?" value="Tenho medo de borboletas." />
            <FakeField label="Qual é outra mentira sobre você?" value="Já pulei de paraquedas." />
            <button className="btn wide" type="button" tabIndex={-1}>
              Salvar minhas afirmações
            </button>
          </div>
        </RoomChrome>
      </Preview>
    </>
  );
}

function VoteSlide() {
  return (
    <>
      <Lesson kicker="Votação" title="Descubra a verdade sobre quem está na vez">
        <ul>
          <li>Aparecem 3 afirmações embaralhadas.</li>
          <li>Escolha a que você acha verdadeira.</li>
          <li>Quem está na vez não vota — já sabe a resposta.</li>
        </ul>
      </Lesson>
      <Preview>
        <RoomChrome code="X7K9" people={votePeople} scoring>
          <div className="vote-screen">
            <div className="vote-top">
              <div className="round-progress">
                <span>Rodada 1 de 3</span>
                <div className="round-bar" aria-hidden>
                  <i style={{ width: "33%" }} />
                </div>
              </div>
              <div className="timer-pill">
                <ClockIcon />
                00:28
              </div>
            </div>
            <h2 className="question">Qual dessas afirmações é a verdade sobre Ana?</h2>
            <div className="choices">
              <span className="choice">
                <span className="letter">A</span>
                <span>Coleciona pedras da praia.</span>
              </span>
              <span className="choice selected">
                <span className="letter">B</span>
                <span>Já morou no Japão.</span>
              </span>
              <span className="choice">
                <span className="letter">C</span>
                <span>Tem três gatos em casa.</span>
              </span>
            </div>
            <div className="vote-note">
              <LockIcon />
              <div>
                <strong>Você já enviou sua resposta!</strong>
                <p>Aguarde o tempo terminar para ver o resultado.</p>
              </div>
            </div>
          </div>
        </RoomChrome>
      </Preview>
    </>
  );
}

function RevealSlide() {
  return (
    <>
      <Lesson kicker="Revelação" title="A verdade aparece. Acerto vale 1 ponto">
        <ul>
          <li>Verde é a verdade. Vermelho são as mentiras.</li>
          <li>Imagens, se houver, só entram agora.</li>
          <li>Depois a vez passa para a próxima pessoa.</li>
        </ul>
      </Lesson>
      <Preview>
        <RoomChrome code="X7K9" people={votePeople} scoring>
          <div className="reveal-screen">
            <article className="truth-hero">
              <div className="truth-badge">
                <span className="truth-check">✓</span>
                A verdade era:
              </div>
              <div className="truth-hero-body">
                <h3>Já morou no Japão.</h3>
              </div>
            </article>
            <div className="lie-grid">
              <article className="lie-card">
                <div className="lie-head">
                  <span className="lie-x">✕</span>
                  <h3>Coleciona pedras da praia.</h3>
                </div>
              </article>
              <article className="lie-card">
                <div className="lie-head">
                  <span className="lie-x">✕</span>
                  <h3>Tem três gatos em casa.</h3>
                </div>
              </article>
            </div>
            <div className="reveal-stats">
              <div className="stat-card ok">
                <span className="stat-icon ok">✓</span>
                <div>
                  <strong>2</strong>
                  <span>acertaram</span>
                </div>
              </div>
              <div className="stat-card no">
                <span className="stat-icon no">✕</span>
                <div>
                  <strong>1</strong>
                  <span>erraram</span>
                </div>
              </div>
            </div>
          </div>
        </RoomChrome>
      </Preview>
    </>
  );
}

function FinishSlide() {
  return (
    <>
      <Lesson kicker="Fim de jogo" title="O ranking fecha a partida">
        <ul>
          <li>Cada acerto vale 1 ponto. Quem não votou fica com 0.</li>
          <li>Empate no 1º lugar é compartilhado.</li>
          <li>Dá para jogar de novo na mesma sala.</li>
        </ul>
      </Lesson>
      <Preview>
        <section className="finish deck-finish">
          <p className="finish-brand">
            Uma Verdade <span>e Duas Mentiras</span>
          </p>
          <TrophyArt />
          <h2>Fim de jogo!</h2>
          <p className="lede">Confira o ranking final da equipe.</p>
          <div className="podium">
            <div className="place p2">
              <div className="place-avatar">
                <MiniCrown />
                <span className="avatar" style={{ background: "#38a054" }}>
                  <PersonMark />
                </span>
              </div>
              <div className="place-rank">2º</div>
              <div className="name">Bruno</div>
              <div className="pts">1 ponto</div>
            </div>
            <div className="place p1">
              <div className="place-avatar">
                <MiniCrown />
                <span className="avatar" style={{ background: "#e4458c" }}>
                  <PersonMark />
                </span>
              </div>
              <div className="place-rank">1º</div>
              <div className="name">Carla</div>
              <div className="pts">2 pontos</div>
            </div>
            <div className="place p3">
              <div className="place-avatar">
                <MiniCrown />
                <span className="avatar" style={{ background: "#f6a04d" }}>
                  <PersonMark />
                </span>
              </div>
              <div className="place-rank">3º</div>
              <div className="name">Ana</div>
              <div className="pts">0 pontos</div>
            </div>
          </div>
        </section>
      </Preview>
    </>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return (
    <div className="deck-preview" aria-hidden>
      {children}
    </div>
  );
}

function RoomChrome({
  code,
  people,
  scoring = false,
  children,
}: {
  code: string;
  people: Array<{ name: string; color: string; you?: boolean; admin?: boolean; score?: number; status?: string }>;
  scoring?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="room-frame deck-mock">
      <header className="room-head">
        <div className="brand-lockup">
          Uma Verdade <span className="accent">e Duas Mentiras</span>
        </div>
        <span className="room-pill">Sala: {code}</span>
      </header>
      <div className="room-body">
        <section className="stage-card">{children}</section>
        <aside className="sidebar">
          <h2>{scoring ? "Pontuação" : `Participantes (${people.length})`}</h2>
          {people.map((person) => (
            <div key={person.name} className={`player ${person.you ? "active" : ""}`}>
              <span className="avatar" style={{ background: person.color }}>
                <PersonMark />
              </span>
              <span className="meta">
                <strong>
                  {person.name}
                  {person.admin ? <span className="admin-mark"> Admin</span> : null}
                </strong>
                {person.status ? (
                  <small>
                    <span className={`status-tag ${person.status === "Preenchido" || person.status === "Pronto" ? "ok" : ""}`}>
                      {person.status}
                    </span>
                  </small>
                ) : null}
              </span>
              {scoring ? <span className="score">{person.score ?? 0}</span> : <span className="more-dots">⋮</span>}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function FakeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="prep-item">
      <label>{label}</label>
      <div className="prep-row">
        <input className="prep-input" readOnly tabIndex={-1} value={value} />
      </div>
      <span className="add-image">Adicionar imagem (opcional)</span>
    </div>
  );
}

const lobbyPeople = [
  { name: "Ana", color: "#f6a04d", admin: true },
  { name: "Bruno", color: "#38a054" },
  { name: "Carla", color: "#e4458c", you: true },
];

const prepPeople = [
  { name: "Ana", color: "#f6a04d", admin: true, status: "Preenchido" },
  { name: "Bruno", color: "#38a054", status: "Pendente" },
  { name: "Carla", color: "#e4458c", you: true, status: "Pendente" },
];

const votePeople = [
  { name: "Ana", color: "#f6a04d", score: 0 },
  { name: "Bruno", color: "#38a054", score: 0 },
  { name: "Carla", color: "#e4458c", you: true, score: 0 },
];

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

function PersonMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 19.5c.6-3.6 3.4-6 7-6s6.4 2.4 7 6" />
    </svg>
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

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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

function MiniCrown() {
  return (
    <svg className="mini-crown" viewBox="0 0 16 14" width="16" height="12" aria-hidden>
      <path
        d="M1.5 12.5h13l-1-8-3.5 3.2L8 1.5 6 7.7 2.5 4.5l-1 8Z"
        fill="#e8b84a"
        stroke="#e8b84a"
        strokeLinejoin="round"
      />
    </svg>
  );
}
