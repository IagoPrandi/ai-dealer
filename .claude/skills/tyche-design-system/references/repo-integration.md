# Integração no repo `IagoPrandi/ai-dealer`

```
repo:   IagoPrandi/ai-dealer
branch: main
path:   apps/web/src/features/tyche
stack:  Next 16 (webpack) + React 19, CSS global, sem Tailwind, sem CSS-in-JS
```

## Responsive implementation contract

- Read `desktop.md` before changing the play app at desktop widths.
- The desktop shell starts at `min-width: 1024px`: 260px navigation rail, 70px context bar,
  and a content canvas capped at 1120px.
- Keep the mobile JSX and state transitions canonical. Use `.ide-deck` as `display: contents`
  below the breakpoint and `.ide-desktop-only` for desktop companion panels.
- Do not branch on `window.innerWidth` in React or maintain separate mobile and desktop state.
- `TycheApp.tsx` owns the shared desktop rail and context bar. Screen files own only their
  content grids and screen-specific desktop summaries.
- The source handoff is `design_handoff_desktop/Tyche Desktop.dc.html`; its generated
  `support.js` is reference runtime code and is not copied into the application bundle.

## Como o styling funciona hoje

- `apps/web/src/features/tyche/tyche.css` — folha única da feature (~34 KB). Define as
  variáveis dentro de `.ide-app` (não em `:root`) e todas as classes `.ide-*`.
- As telas ficam em `features/tyche/screens/*.tsx` e usam classe + `style={{}}` inline
  para o que é específico da tela. Esse padrão misto é o do repo — siga-o.
- Componentes compartilhados em `features/tyche/shared` (`Ico`, `Medal`, `VoteTally`,
  `Dealer`, `useCountdownTo`, `useLivePrize`).
- Estado global via `features/tyche/context` (`useTyche()`), formatação em `data/format`
  (`fmtSol`, `fmtInt`, `fmtClaimSol`, `lamportsToSol`, `truncateAddress`).

## Mapa tela → arquivo

| Tela | Arquivo |
| --- | --- |
| Round · Home | `screens/Home.tsx` |
| Play (pick / review / done) | `screens/Play.tsx` |
| Rules · In voting / Finalists | `screens/Vote.tsx` |
| Create · rule with AI | `screens/Create.tsx` |
| Result | `screens/Result.tsx` |
| Draw result pop-up | `screens/DrawResult.tsx` |
| Rewards · Stake & earn | `screens/Rewards.tsx` |
| Account | `screens/Profile.tsx` |
| Claims | `screens/Claims.tsx` |
| My guesses | `screens/Guesses.tsx` |
| Invite friends | `screens/Invite.tsx` |
| Share | `screens/Share.tsx` |
| Connect wallet | `screens/Connect.tsx` |

## Remapeamento das variáveis (o que muda no `tyche.css`)

O tema antigo é roxo/verde Solana com cantos arredondados e gradiente. A linguagem 3a
substitui os **valores**, não os nomes — assim as telas existentes acompanham sem reescrita:

| Variável do repo | Antes | Agora (3a) |
| --- | --- | --- |
| `--bg` | `#0B0910` | `#170B22` |
| `--bg-2` | `#100C18` | `#0C0512` |
| `--surface` | `#17121F` | `#120A1B` |
| `--surface-2` | `#1E1830` | `#0F0618` |
| `--surface-3` | `#271F3B` | `#1E1226` |
| `--line` | `rgba(255,255,255,.075)` | `rgba(241,232,214,.14)` |
| `--line-2` | `rgba(255,255,255,.13)` | `rgba(241,232,214,.2)` |
| `--text` | `#F4F1FA` | `#F1E8D6` |
| `--muted` | `#A39CB6` | `#A88FBF` |
| `--dim` | `#6C667C` | `#7E6A94` |
| `--purple` / `--purple-soft` | `#9945FF` / `#C77DFF` | `#FF2E88` / `#FF7AB8` |
| `--green` | `#14F195` | `#7CF6B8` |
| `--yellow` / `--gold` | `#FFD23F` | `#FFD23F` (mantém) |
| `--red` | `#FF6B6B` | `#FF3B2F` |
| `--bronze` | `#E8945A` | `#FF9B4A` |
| `--num-font` | `'Space Grotesk'` | `'DM Mono'` |
| `--grad` / `--grad-btn` | gradiente Solana | **remover** — 3a não usa gradiente colorido |

Novas variáveis a adicionar (valores completos em `tokens.css`): `--cyan`, `--orange`,
`--plate`, `--solid-4`, `--solid-5`, `--ring*`, `--ghost-cyan`, `--halftone`, `--dashed`.

## Classes que precisam mudar de forma (não só de cor)

| Classe | Mudança |
| --- | --- |
| `.ide-card` | `border-radius: 0`; trocar `border` por `box-shadow: inset 0 0 0 1.5px …` |
| `.ide-btn` | fundo `#FFD23F`, texto `#170B22`, Bevan uppercase, `border-radius: 24px`, `box-shadow: 5px 5px 0 #FF6A1F` |
| `.ide-btn-ghost` | pílula com `--ghost-cyan`, Oswald 600 `.14em` uppercase |
| `.ide-grad-text` | remover o gradiente; virar chapa deslocada (`text-shadow: var(--plate-lg)`) |
| `.ide-num` | `font-family: 'DM Mono'`, `letter-spacing: .12em` (não `-0.02em`) |
| `.ide-pill` | cantos retos quando for chip de marcação; pílula só em ação |
| `.ide-numcell` | `border-radius: 0`, estados conforme "Fichas de número" em `components.md` |
| `.ide-chip`, `.ide-stat`, `.ide-rulerow`, `.ide-listrow` | `border-radius: 0`, contorno inset |
| `.ide-tabs` | trilho `inset 0 -2px 0`, aba ativa `inset 0 -3px 0 #FFD23F` (amarelo, não roxo) |
| `.ide-nav` | fundo `#0C0512` + `inset 0 1px 0 rgba(241,232,214,.22), 0 -40px 80px -30px rgba(255,46,136,.5)` |
| `.ide-nav-fab` | `border-radius: 22px`, `4px 4px 0 #FF6A1F` + halo magenta |
| `.ide-ambient` | substituir pelo overlay de meio-tom (pontos), não blur colorido |
| `.ide-bubble-user` / `.ide-bubble-ai` | conforme "Bolhas de conversa" em `components.md` |
| `.ide-balance` | trilho `rgba(255,59,47,.35)`, preenchimento ciano com glow, sem radius |

Fontes: trocar o carregamento de Outfit / Space Grotesk por
**Bevan, Oswald 400–700, DM Mono 400/500, Archivo 400/600/700** (Google Fonts, via
`next/font` ou o `<link>` já existente no layout).

## Ao criar uma tela nova no repo

1. `screens/NovaTela.tsx` com `"use client"`, seguindo a estrutura do `Home.tsx`
   (raiz `className="ide-app ide-screen"` → `.ide-scroll` com o padding da anatomia).
2. Reaproveite `useTyche()`, `Ico`, `Medal`, `VoteTally` e os formatadores — não crie
   utilitários paralelos.
3. Estilos novos: se o valor aparece em 2+ lugares, vira classe `.ide-*` em `tyche.css`;
   se é único da tela, `style={{}}` inline.
4. Registre a rota no roteador de telas do contexto (`go("novaTela")`) e, se for de nível
   raiz, na tab bar — mas a tab bar tem 5 posições fixas; telas novas entram por navegação.
5. Rode `pnpm lint` e `pnpm typecheck` no `apps/web`.

## Sincronizar depois

`github.md` na raiz do projeto guarda repo, branch, último sync e o mapa tela → arquivo.
Atualize-o quando telas novas entrarem.
