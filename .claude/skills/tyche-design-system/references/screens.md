# Telas — anatomia, inventário e comportamento

## Anatomia de tela (esqueleto obrigatório)

Viewport de referência: **402 × 868** (iPhone 16 Pro). Ordem das camadas, de fora para dentro:

```html
<div style="width:402px; height:868px; border-radius:52px; overflow:hidden;
            position:relative; background:#170B22;
            box-shadow: 0 50px 100px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.08);">

  <!-- 0 · meio-tom (sempre) -->
  <div style="position:absolute; inset:0; z-index:0; pointer-events:none;
              background-image: radial-gradient(rgba(255,46,136,.22) 1px, transparent 1.3px);
              background-size: 4px 4px;"></div>

  <!-- 90 · notch -->
  <div style="position:absolute; top:11px; left:50%; transform:translateX(-50%);
              width:122px; height:35px; border-radius:22px; background:#0C0512; z-index:90;"></div>

  <!-- 80 · status bar: 9:41 à esquerda (DM Mono 14px #F1E8D6, margin-top:8px),
       sinal + bateria à direita (bateria preenchida em #35F0E0) -->

  <!-- 20 · conteúdo rolável -->
  <div class="tyche-scroll" style="position:absolute; inset:0; z-index:20;
              overflow-y:auto; overflow-x:hidden; padding:58px 16px 92px;"> … </div>

  <!-- 40 · CTA fixo OU tab bar -->
  <!-- 95 · home indicator: 134×5, bottom:7px, rgba(241,232,214,.5) -->
</div>
```

**Padding do scroll:** topo 58–62 · laterais 16–18 · base **40** (sem chrome) ·
**92–96** (tab bar) · **104–130** (CTA fixo).

**CTA fixo de rodapé:** `padding: 16px 19px 22px` sobre
`background: linear-gradient(180deg, transparent, #170B22 36%)`.

**Header de tela:** `display: flex; align-items: center; gap: 12px; margin-bottom: 12–18px` —
botão voltar 38×38 → título Bevan com chapa → ação secundária com `margin-left: auto`.

No repo (fora do board de apresentação) o bezel/notch/status bar/home indicator vêm do shell
existente (`.ide-phone-shell`, `.ide-di`, `.ide-statusbar`, `.ide-homebar`); a tela nova
implementa apenas a camada de meio-tom, o scroll e o chrome inferior.

---

## Inventário das 16 telas

| # | Tela | Arquivo HTML | Padrão que ela define |
| --- | --- | --- | --- |
| 01 | Round · Home | `01-round-home.html` | hero com raios, cartão de criar regra, lista de regras, tab bar |
| 02 | Play · Make a guess | `02-play-pick.html` | grade de seleção, slots, CTA fixo com estado |
| 03 | Play · Review guess | `03-play-review.html` | lista de resumo com divisores, nota informativa |
| 04 | Play · Guess confirmed | `04-play-done.html` | estado terminal centralizado, 3 ações empilhadas |
| 05 | Rules · In voting | `05-rules-in-voting.html` | abas, cartão de gate, lista votável com medalha |
| 06 | Rules · Finalists | `06-rules-finalists.html` | cartão de finalista com barra e dois botões de voto |
| 07 | Create · rule with AI | `07-create.html` | conversa, cartão de interpretação, composer fixo |
| 08 | Result | `08-result.html` | vitória com glow, fichas sorteadas, seções com filete, legenda |
| 09 | Draw result · pop-up | `09-draw-result-popup.html` | modal centralizado |
| 10 | Rewards · Stake & earn | `10-rewards.html` | cartão de valor + claim, época, par de stats, form de lock |
| 11 | Account | `11-account-profile.html` | saldo grande, par de stats, claim, navegação de conta |
| 12 | Claims | `12-claims.html` | contadores, lista de claims com badge de status |
| 13 | My guesses | `13-my-guesses.html` | cartões por palpite com fichas 36 px |
| 14 | Invite friends | `14-invite.html` | par de cartões de recompensa, campo + botão copiar |
| 15 | Share | `15-share.html` | cartão de preview de conteúdo compartilhável |
| 16 | Connect wallet | `16-connect.html` | bottom sheet com lista de carteiras |

---

## Hierarquia de conteúdo (a ordem em que as telas se organizam)

1. **Header** — voltar + título + uma ação secundária no máximo.
2. **O número que importa** (quando houver) — valor grande em Bevan com chapa, unidade em
   DM Mono ciano, rótulo Oswald acima em tracking largo.
3. **A ação primária** — um botão amarelo, imediatamente abaixo do número.
4. **Contexto da rodada** — id `#0142` em ciano, contagens em DM Mono `#A88FBF`.
5. **Listas e detalhes** — rótulo de seção ciano, depois os itens.
6. **Saídas secundárias** — botões fantasma no fim, nunca no topo.

Uma tela não repete o mesmo peso duas vezes: se já existe um número Bevan 40+, os demais
valores caem para Bevan 20–21 em blocos de stat.

---

## Estados e comportamento

Toda tela nova deve desenhar estes estados — a maioria não está nos HTMLs de referência:

| Estado | Tratamento |
| --- | --- |
| **Vazio** | Cartão `#0F0618` com contorno neutro, texto Archivo 14px `#A88FBF` centralizado, uma frase que diz o que fazer ("No rules proposed yet — be the first to create one.") |
| **Carregando** | Skeleton retangular `background: #0F0618`, altura do item real, `border-radius: 0`, `animation: rb-pulse 1.6s ease-in-out infinite`. Nunca spinner sozinho em tela cheia |
| **Erro / backend fora** | Cartão de lista com contorno vermelho `inset 0 0 0 1.5px rgba(255,59,47,.45)`, ícone em quadrado `#FF3B2F`, título Oswald + linha explicativa, toque para tentar de novo |
| **Aguardando carteira** | Badge `Pending` amarelo + nota "Pending wallet approval — resume in your wallet." (padrão da tela 12) |
| **Bloqueado (sem round pass)** | Cartão de gate com cadeado + CTA "Play now · 0.01" (padrão da tela 05) |
| **Desabilitado** | `opacity: .45` e o rótulo do botão informa o que falta |
| **Confirmado** | Badge verde `#7CF6B8`; nunca troca a cor do cartão inteiro |

Comportamentos já definidos:

- **Fluxo principal:** Home → Play (pick) → Review → Confirmed → Rules (votar) ou Create →
  pop-up de sorteio → Result → Claims.
- **Gate:** votar e criar regras exigem palpite na rodada (round pass).
- **Seleção de números:** toque alterna; máximo 6; contador `n/6`; CTA mostra
  "N numbers left" enquanto incompleto. "Choose for me" preenche 6 distintos.
- **Votação:** a favor grátis; contra custa `0.002` com limite de 5 por rodada; barra reflete
  o % a favor; contra > a favor → `eliminated` (`line-through`, `opacity: .65`).
- **Timers:** DM Mono, atualizados a cada segundo; badge "Ao vivo" pulsa em 2.2 s.
- **Carteira:** conectar, submeter, votar contra e claim abrem aprovação na carteira —
  estados idle, aguardando assinatura, pendente on-chain, sucesso, erro/rejeitado.
- **Copiar link:** confirmação por toast (padrão do app).
- **Responsivo:** desenhado para 402 px. Acima disso, coluna centralizada com máx. ~440 px.
- **Movimento:** só `rb-pulse` (2.2 s) e transições curtas (.12–.15 s) em toque. Nenhuma
  animação de entrada nova; respeite `prefers-reduced-motion` (o repo tem `.ide-calm`).

---

## Modelo de estado (para telas novas que consomem os mesmos dados)

- `round`: `id`, `status` (`live` | `settling` | `settled`), `endsAt`, `prizePool`,
  `playersCount`, `rulesCount`, `entryFee`.
- `guessDraft`: `numbers: number[]` (máx 6) + derivados `remaining`, `isComplete`.
- `guesses`: por rodada — `id`, `numbers`, `fee`, `status`.
- `rules`: em votação (título, tally a favor/contra, autor) e finalistas
  (`mostVoted` | `vrf`, `pctInFavor`, `state`).
- `votes`: votos do usuário na rodada + contra usados (limite 5).
- `ruleDraft`: histórico da conversa, perguntas abertas, interpretação, dificuldade.
- `wallet`: `connected`, `address`, `cluster`, `provider`.
- `claims`: `type` (prize | reward), `roundId`, `txRef`, `amount`, `status`.
- `rewards`: `jdrClaimable`, `epoch`, `distributable`, `claimableNow`, `lockAmount`.
- `referral`: `code`, `link`, `rewardYou`, `rewardThem`, `invitedBy`.

## Microcopy

Inglês, minúsculas em rótulos utilitários (`vote →`, `edit`, `clear`, `connect`, `free`),
uppercase via CSS em títulos e botões. Frases curtas e factuais, sem exclamação — exceto o
estado de vitória ("You won!", "Guess confirmed!"). Valores sempre com unidade explícita
(`0.01 SOL`, `128.40 JDR`). Ids de rodada com quatro dígitos e cerquilha (`#0142`).
