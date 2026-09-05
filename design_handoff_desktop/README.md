# Handoff — UI desktop do Tyche

Reproduz `Tyche Desktop.dc.html` (turno 1: `1a`…`1p`) em `apps/web/src/features/tyche`.
O mobile não muda: tudo aqui vive em `@media (min-width: 1024px)` ou dentro de
`.ide-deck`, que é `display: contents` abaixo desse ponto.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `desktop.css` | camada desktop pronta — substitui o bloco "DESKTOP LAYER" de `tyche.css` (~linhas 1378-1580) |
| `markup.md` | esqueleto de markup por tela, com as classes que a camada espera |
| `Tyche Desktop.dc.html` | o design em si, medida exata (frames 1440 × 880) |

## Geometria

```
rail        260px    #0C0512, hairline à direita, estado da rodada no pé
top bar      70px    hairline embaixo, padding-inline 32px
conteúdo   1120px    max-width, padding 26px 32px 30px
colunas    1fr/400   home, result, rewards
           1fr/440   rules (lista + detalhe)
           1fr/360   play (grade + resumo)
           1fr/420   create (chat + painel)
           400/1fr   account
diálogos   540-760   centrados (connect, confirmação, sorteio, share)
```

Nenhum token novo: cores, sombras sólidas, anéis `inset` e as quatro famílias
tipográficas vêm de `tyche.css` como estão.

## Ordem sugerida

1. **Shell** — `desktop.css` + rail e `.ide-topbar` em `TycheApp.tsx`. Sem tocar em tela; já entrega rail com estado da rodada, medida única e diálogos centrados.
2. **Play e Vote** — as duas que mais mudam de comportamento: Play funde pick e review num painel fixo; Vote ganha `selectedRuleId` e o detalhe ao lado.
3. **Create, Result, Rewards, Account, Claims, Guesses, Invite** — cada uma é envolver dois blocos num `.ide-deck` e trocar cards por `.ide-table`.

## Mapa telas → arquivos

| Design | Tela | Arquivo |
| --- | --- | --- |
| 1a | Home | `screens/Home.tsx` |
| 1c | Play · grade + resumo | `screens/Play.tsx` |
| 1d | Aposta confirmada | `screens/Play.tsx` (overlay) |
| 1e | Rules · em votação | `screens/Vote.tsx` |
| 1f | Rules · finalistas | `screens/Vote.tsx` |
| 1g | Create com IA | `screens/Create.tsx` |
| 1h | Result | `screens/Result.tsx` |
| 1i | Resultado do sorteio | `screens/DrawResult.tsx` |
| 1j | Rewards | `screens/Rewards.tsx` |
| 1k | Account | `screens/Profile.tsx` |
| 1l | Claims | `screens/Claims.tsx` |
| 1m | My guesses | `screens/Guesses.tsx` |
| 1n | Invite | `screens/Invite.tsx` |
| 1o | Share | `screens/Share.tsx` |
| 1p | Connect wallet | `screens/Connect.tsx` |

Home: `1a` — faixa da rodada em linha cheia (prêmio, contador, Play now · 0.01
e My guesses), régua de métricas, The rules à esquerda e Round activity à
direita. O card "Create your rule" sai da Home: a ação vive no rail.

## Detalhes que costumam escapar

- Botões `.ide-btn` reservam 3px de margem à direita para a sombra sólida: largura cheia é `calc(100% - 3px)`, nunca `width: 100%`.
- Contornos são `inset box-shadow`, não `border` — a policy de bordas no fim de `tyche.css` remove `border` de quase tudo.
- Cantos retos em tudo, exceto botões (20/24), pills (999) e o botão de seta (14).
- Grade de números: 10 colunas no desktop, hover amarelo só nas células livres.
- Todo card leva anel `inset`, com ou sem sombra sólida; células de grade com `gap: 1px` são a única exceção (o anel cairia sobre o texto).
- O rail é idêntico em todas as telas de navegação — muda só o item ativo e a sub-lista da tela.
- `Play now` precisa de `white-space: nowrap` — em Bevan o rótulo quebra em duas linhas dentro de colunas estreitas.
