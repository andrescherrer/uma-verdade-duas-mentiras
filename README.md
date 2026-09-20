# Uma Verdade e Duas Mentiras

Jogo multiplayer para uma equipe na mesma sala, sem cadastro. O estado da partida vive na memória do servidor e é sincronizado por WebSocket (Socket.IO). Quem entra numa sala fica registrado em SQLite (IP, nome e localização aproximada) por 30 dias, visível só no painel admin.

## Como rodar

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend/WebSocket: http://localhost:3001

Em produção: `npm run build && npm start` (o servidor entrega o `client/dist`).

### Admin

- Usuário padrão: `admin-master-blaster` (ou `ADMIN_USERNAME`).
- Em **desenvolvimento**, senha padrão: `!@#987654321` (ou `ADMIN_PASSWORD`).
- Em **produção** (`NODE_ENV=production`), se `ADMIN_PASSWORD` não estiver definida, a senha do dia é `!@#` + data `YYYYMMDD` no fuso `America/Sao_Paulo` (ex.: `!@#20260920`).
- Sessão admin vai em cookie `HttpOnly` (`vm_admin`), não no `sessionStorage`.
- `TRUST_PROXY=1` só se a app estiver atrás de um reverse proxy real; sem isso, `X-Forwarded-For` do cliente é ignorado.
- Imagens exigem header `x-session-token` (sem token na URL).
- `GET /api/rooms/:id` só responde `{ roomId }` para quem já tem sessão na sala.

## Arquitetura

O navegador **não** é a fonte da verdade. Cada sala existe na memória do servidor (`GameRoom`). O cliente só envia intenções (`room:join`, `round:vote`, …) e recebe um recorte do estado adequado à fase atual.

```
Cliente React  --Socket.IO-->  Express + Socket.IO
       ^                              |
       |         state:sync           |
       +----- personalizado por jogador
                      |
                 GameRoom (fase, fila, votos, timer, pontuação)
```

### Frontend

- React + Vite, rotas `/sala/:codigo`, `/todas-os-jogos` e `/ultimos-30-dias`.
- Sem login: nickname + `sessionToken` no `localStorage` para reconectar.
- Renderiza **somente** o `state:sync` do servidor (fase, vez, opções, cronômetro, ranking).

### Backend

- `server/src/room.ts`: regras, fila de participantes, timer, pontuação, remoção.
- `server/src/app.ts`: HTTP (criar sala, upload de imagem) + eventos Socket.IO.
- `server/src/visitors.ts`: SQLite com IP, nome e local geográfico de cada entrada; registros somem depois de 1 mês. A lista paginada fica em `/ultimos-30-dias`.
- Timer com `setTimeout` no servidor (`endsAt` absoluto). Se todos os eleitores conectados votam, a rodada fecha na hora.

O arquivo do banco fica em `server/data/visitors.sqlite` (ou `SQLITE_PATH`). IPs da rede local aparecem como “Rede local”; IPs públicos usam GeoIP (cidade, região, país).

### O que fica no servidor (nunca no cliente antes da hora)

- Qual afirmação é a verdade (`kind: truth | lie`).
- `imageId` das afirmações **durante a votação**.
- Mapa de votos por `playerId` até a revelação.
- Token de sessão e socket atual de cada pessoa.

O recorte de votação enviado ao cliente tem só `{ id, text }` nas opções, a contagem de votos e o **próprio** voto do jogador.

## Estados da partida

| Fase | Quem controla | O que a sala vê |
| --- | --- | --- |
| `lobby` | Servidor | Lista de pessoas, admin, tempo de rodada |
| `preparation` | Servidor | Formulário; quem já terminou |
| `voting` | Servidor + timer | Vez de X, 3 afirmações embaralhadas, cronômetro |
| `reveal` | Servidor + timer ~10s | Verdade/mentiras, imagens, acertos |
| `finished` | Servidor | Ranking |

A “próxima pessoa” não é uma tela à parte: após a revelação o servidor avança a fila e abre a votação seguinte.

## Contrato WebSocket

### Cliente → servidor

| Evento | Payload | Quem |
| --- | --- | --- |
| `room:join` | `{ roomId, nickname, sessionToken? }` | Qualquer conexão |
| `room:leave` | — | Jogador |
| `room:kick` | `{ playerId }` | Qualquer participante |
| `room:admin-change` | `{ playerId }` | Admin |
| `room:set-timer` | `{ seconds: 15\|30\|45\|60 }` | Admin, antes do jogo |
| `game:start-preparation` | — | Admin |
| `prep:submit` | `{ truth, lie1, lie2 }` cada um `{ text, imageId }` | Jogador |
| `game:start` | — | Admin, todos prontos |
| `round:vote` | `{ statementId }` | Eleitor (não quem está na vez) |
| `round:advance` | — | Admin, durante revelação |
| `game:reset` | — | Admin, no resultado |

### Servidor → cliente

| Evento | Quando |
| --- | --- |
| `room:joined` | `{ playerId, sessionToken, roomId }` |
| `state:sync` | Qualquer mudança relevante, **personalizado** para o destinatário |
| `room:error` | `{ code, message }` |
| `room:kicked` | Esta sessão foi removida |

`state:sync` cobre entrada/saída, admin, fase, vez, opções, timer (`voteEndsAt` + `serverNow`), progresso de votos, revelação, pontuação e ranking.

## Regras de produto resolvidas

- **Quem vota:** todos, **exceto** a pessoa da vez (ela já conhece a verdade; pontuar nela mesma distorceria o ranking).
- **Entrada tardia:** permitida em `lobby`, `preparation` e `finished`. Recusada no meio da partida, salvo reconexão com `sessionToken`.
- **Reconexão:** o token restaura o mesmo jogador, afirmações, votos e pontos. Desconectar **não** remove da sala (evita sumir num refresh). Quem ficou “preso” pode ser removido por qualquer pessoa.
- **Admin sai ou é removido:** o próximo da lista (preferência a quem está conectado) vira admin.
- **Remoção no meio da rodada:** some da lista e da fila. Se era a vez dela, a rodada é abortada e o jogo segue. Votos dela são descartados. Se restar menos de 2 pessoas, vai para o resultado.
- **Empate:** mesma colocação; a seguinte pula (1º, 1º, 3º). Na lista, empate desempata só visualmente pelo nome.
- **Pontos:** acerto +1; erro ou ausência 0. Quem não votou até o fim do timer fica com 0 na rodada.
- **Imagens:** upload HTTP autenticado pelo token; URL só entra no estado na revelação.

## Concorrência

O Node processa eventos em uma thread por sala em memória. Voto duplicado é rejeitado (`already-voted`). Dois cliques em “iniciar” encontram a fase já mudada e falham. O embaralhamento acontece **uma vez** no `round:start` e fica gravado no servidor; todos os clientes veem a mesma ordem.

## Testes

```bash
npm test
```

Cobre vazamento da resposta na votação, reconexão, kick do admin/sujeito, timer, ranking empatado e um fluxo Socket.IO com dois clientes reais.
