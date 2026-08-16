---
name: tyche-design-system
description: Design system da interface mobile do Tyche na linguagem visual "3a — Tinta Neon" (cartaz retro-cyberpunk: tipografia de chapa deslocada, blocos de cantos retos com sombra sólida, halo neon). Use sempre que criar, alterar ou revisar qualquer tela, componente, estado ou fluxo do app Tyche — inclusive telas novas que não existem no handoff original. Contém tokens, receitas de componentes com valores literais, anatomia de tela e as regras que definem o estilo.
---

# Tyche — Design System "3a · Tinta Neon"

Linguagem visual do app mobile do Tyche (loteria on-chain na Solana). Referência: 16 telas
implementadas em `references/screens-html/` — **HTML autônomo, CSS literal inline**. Quando
esta skill e um arquivo de `screens-html/` divergirem, **o HTML manda**.

Repo de destino: `IagoPrandi/ai-dealer`, `apps/web/src/features/tyche` (Next 16 + React 19,
CSS global em `features/tyche/tyche.css`, classes `.ide-*`, sem Tailwind).
Ver `references/repo-integration.md` antes de escrever TSX.

## O que define este estilo (as 6 regras não-negociáveis)

1. **Cantos retos.** Cartões, chips, fichas de número, badges e blocos de stat têm
   `border-radius: 0`. Arredondado existe só em: botões (20–24 px), pílulas (999 px),
   FAB (22 px), ícone-botão de seta (14 px), bezel (52 px).
2. **Sombra sólida, não difusa.** Elemento em destaque recebe offset duro
   (`4px 4px 0` / `5px 5px 0`) na cor complementar — laranja `#FF6A1F` sob amarelo,
   ciano `#35F0E0` sob cartão escuro, magenta `#FF2E88` sob ficha clara. Nunca sombra cinza.
3. **Chapa deslocada em todo título.** `text-shadow: -2px 0 0 #FF2E88, 2px 0 0 #35F0E0`
   em Bevan. Em números grandes vai a `-3px/3px` + glow magenta.
4. **Contorno em vez de borda.** Sempre `box-shadow: inset 0 0 0 1.5px <cor>` — não `border`
   (borda muda o box e desalinha a grade de números).
5. **Quatro famílias, papéis fixos.** Bevan = display/números grandes/CTA primário.
   Oswald = rótulos, botões secundários, nomes. DM Mono = tudo numérico, timers, endereços,
   tallies, rótulos micro. Archivo = parágrafo. Nunca troque o papel de uma família.
6. **Meio-tom sempre presente.** Toda tela tem o overlay de pontos magenta como camada 0.

Anti-padrões: gradiente colorido de fundo, `border` visível, sombra difusa preta, cantos
arredondados em cartão, texto de parágrafo em Oswald, número em Archivo, emoji, ícone
preenchido (todos os ícones são stroke).

## Tokens essenciais

Arquivo completo e pronto para colar: `references/tokens.css`.

**Superfícies** — `#170B22` fundo · `#0C0512` tab bar/notch · `#120A1B` cartão destacado ·
`#0F0618` cartão de lista · `#1E1226` input/chip interno.
**Texto** — `#F1E8D6` primário · `#A88FBF` secundário · `#7E6A94` terciário/inativo ·
`#C6B6D6` número não selecionado.
**Acentos** — `#FFD23F` amarelo (ação primária) · `#FF6A1F` laranja (só sombra sólida) ·
`#35F0E0` ciano (rótulo de seção, voto a favor, positivo) · `#FF2E88` magenta (chapa, aba
ativa, meio-tom) · `#E8231A`/`#FF3B2F` vermelho (ao vivo, voto contra, eliminado) ·
`#7CF6B8` verde (confirmado, winners) · `#FF9B4A` bronze (3º lugar).

**Regra de cor:** amarelo = a ação que o usuário deve tomar (um por tela). Ciano = informação
positiva e rótulo de seção. Magenta = pertencimento à marca e estado ativo. Vermelho = custo,
risco, eliminação. Verde = confirmação já concluída.

**Tipografia** — Bevan (sempre `uppercase`) · Oswald 400/500/600/700 (uppercase,
`letter-spacing` .04em–.30em) · DM Mono 400/500 (`letter-spacing` .10em–.18em) ·
Archivo 400/600/700 (`line-height` 1.5).
Escala em uso: 9.5 10 10.5 11 11.5 12 12.5 13 13.5 14 14.5 15 15.5 16 17 18 19 20 21 22 23
24 26 30 34 40 42 44 52 70. Nada abaixo de 9.5. Alvos de toque ≥ 44 px.

## Como construir uma tela nova

1. Leia `references/screens.md` → seção "Anatomia de tela" e copie o esqueleto
   (meio-tom → notch → status bar → scroll → CTA fixo/tab bar → home indicator).
2. Escolha o arquivo de `references/screens-html/` mais próximo do que vai construir e
   **leia o CSS inline dele**. Não deduza valores desta prosa — copie de lá.
3. Monte o conteúdo só com as receitas de `references/components.md`. Se precisar de algo
   que não existe lá, derive do componente mais próximo mantendo as 6 regras acima; não
   invente um tratamento novo.
4. Rode o checklist abaixo.

Mapa rápido do que copiar por tipo de tela:

| Vai construir | Comece de |
| --- | --- |
| Tela de lista com itens votáveis | `05-rules-in-voting.html`, `06-rules-finalists.html` |
| Tela de formulário / seleção | `02-play-pick.html` |
| Tela de revisão / resumo com linhas | `03-play-review.html` |
| Tela de sucesso / estado terminal | `04-play-done.html` |
| Tela de valor + claim | `10-rewards.html`, `11-account-profile.html`, `12-claims.html` |
| Conversa / composer | `07-create.html` |
| Modal centralizado | `09-draw-result-popup.html` |
| Bottom sheet | `16-connect.html` |
| Resultado longo com seções | `08-result.html` |
| Campos de copiar/colar link | `14-invite.html`, `15-share.html` |

## Checklist antes de entregar

- [ ] Todo cartão/chip com `border-radius: 0`; arredondado só onde a regra 1 permite.
- [ ] Exatamente **um** botão amarelo de ação primária na tela.
- [ ] Título da tela em Bevan uppercase com chapa deslocada.
- [ ] Todo número, timer, endereço, tally e rótulo micro em DM Mono.
- [ ] Contornos com `inset 0 0 0 1.5px`, nenhum `border` visível.
- [ ] Elemento com sombra sólida à direita tem `margin-right: 3px` (ou o pai reserva o espaço).
- [ ] Overlay de meio-tom presente, `pointer-events: none`, `z-index: 0`.
- [ ] Padding do scroll: topo 58–62, laterais 16–18, base 40 (sem chrome) / 96 (tab bar) /
      104–130 (CTA fixo).
- [ ] Estados: vazio, carregando, erro e pendente-na-carteira desenhados
      (`references/screens.md` → "Estados e comportamento").
- [ ] Ícones SVG stroke `currentColor`, `stroke-width` 1.6–2.4, viewBox 24×24.

## Arquivos

- `references/tokens.css` — todas as variáveis + helpers (`.tyche-halftone`, keyframes).
- `references/components.md` — receitas com valores literais: botões, cartões, listas,
  fichas, badges, abas, barras, bolhas, modal, sheet, tab bar, divisores.
- `references/screens.md` — anatomia de tela, inventário das 16 telas, estados,
  comportamento e o modelo de estado do app.
- `references/repo-integration.md` — como isso vira TSX no `ai-dealer` sem quebrar o padrão.
- `references/screens-html/NN-*.html` — **fonte da verdade**. 16 telas, CSS literal inline.
- `references/screenshots/NN-*.png` — referência visual 2x.
