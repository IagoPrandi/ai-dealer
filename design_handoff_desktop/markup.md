# Estrutura por tela (desktop ≥1024px)

Esqueleto de markup para bater com `Tyche Desktop.dc.html`. Só o desktop muda:
todo agrupamento novo usa `.ide-deck`, que é `display: contents` abaixo de 1024px —
o fluxo mobile continua exatamente o que é hoje.

Convenção do shell (todas as telas):

```jsx
<div className="ide-screen ide-screen-home">
  <header className="ide-topbar">
    <span className="ide-plate">The round</span>
    <span className="ide-num">#0142</span>
    <div className="ide-topbar-actions">{/* ícones, connect */}</div>
  </header>
  <div className="ide-scroll">
    <div className="ide-content">{/* conteúdo da tela */}</div>
  </div>
</div>
```

Rail (`TycheApp.tsx`, dentro do `.ide-nav` existente) — o mesmo em todas as
telas de navegação; só o `.on` muda de item:

```jsx
<div className="ide-nav-brand">
  <span className="ide-plate">Tyche</span>
  <span className="ide-nav-env">devnet</span>
</div>
{/* .ide-nav-btn como hoje; Rules ganha <span className="ide-nav-count">12</span> */}
{/* o FAB vira o botão primário: label "Create a rule" */}
<div className="ide-rail-state">
  <div className="ide-rail-round">
    <div className="ide-rail-round-head">
      <span className="ide-live"><i className="ide-live-dot" /><span>Live</span></span>
      <span className="ide-num">00:34:12</span>
    </div>
    <div className="ide-rail-round-label">Round #0142 · prize</div>
    <div className="ide-rail-round-value">20.50 <span>SOL</span></div>
    <div className="ide-rail-round-meta"><span><b>1,050</b> playing</span><span><b>12</b> rules</span></div>
  </div>
  <button className="ide-rail-wallet"><i />7fA…c2B<b>1.84 SOL</b></button>
</div>
```

---

## Home — `screens/Home.tsx`

```jsx
<div className="ide-deck">
  <section className="ide-roundbar ide-deck-full">
    <div>{/* eyebrow + .ide-prize (int/dec/unit) */}</div>
    <div className="ide-roundbar-timer">
      <span className="ide-live">…</span>
      <div className="ide-roundbar-clock">00:34:12</div>
      <div className="ide-roundbar-caption">until the draw</div>
    </div>
    <div className="ide-roundbar-cta">
      <button className="ide-btn">Play now · 0.01</button>
      <button className="ide-btn ide-btn-ghost">My guesses · 2</button>
    </div>
  </section>

  <div>{/* coluna esquerda */}
    <div className="ide-metrics is-three">…playing / rules in voting / entry fee…</div>
    <div className="ide-card">{/* The rules: 5 linhas .ide-rulerow + botão ghost */}</div>
  </div>

  <div>{/* coluna direita */}
    {/* Round activity: eyebrow + .ide-list de eventos (dot, texto, tempo) */}
    {/* Last round #0141: números sorteados + resumo */}
  </div>
</div>
```

O card "Create your rule" sai da Home no desktop — a ação vive no rail.

## Play — `screens/Play.tsx`

Pick e review deixam de ser dois passos: o resumo vira painel fixo.

```jsx
<div className="ide-deck is-play">
  <div>
    {/* linha de estado: "Pick 6 numbers…", "4/6 selected", botão Choose for me */}
    <div className="ide-numgrid">{/* 100 células, 10 colunas */}</div>
  </div>
  <aside className="ide-card" /* padding 20, ring + solid-5 laranja */>
    {/* Your numbers (chips 44px) · linhas round/chosen/fee/rent · aviso · CTA */}
  </aside>
</div>
```

`Guess confirmed` deixa de ser tela cheia e passa a `.ide-overlay-card` (620px).

## Rules — `screens/Vote.tsx`

Abas migram para a `.ide-topbar`. Estado novo: `selectedRuleId`.

```jsx
<div className="ide-deck is-rules">
  <div>
    {/* aviso "Play to unlock voting" */}
    {/* lista: .ide-rulerow, a selecionada com .is-selected; dois .ide-votebtn por linha */}
  </div>
  <aside className="ide-detail">
    {/* título, descrição, pseudocódigo, worked examples, dificuldade, votar */}
  </aside>
</div>
```

Finalistas: grid de 3 cards + abaixo `.ide-table` de defence activity e a lista
"did not reach the final".

## Create — `screens/Create.tsx`

```jsx
<div className="ide-deck is-create">
  <div className="ide-create-chat">{/* bolhas + composer, medida 720px */}</div>
  <aside className="ide-create-panel">
    {/* My interpretation, dificuldade, worked examples, submit no rodapé */}
  </aside>
</div>
```

Rascunhos do usuário ficam no rail, abaixo da navegação.

## Result — `screens/Result.tsx`

```jsx
<div className="ide-deck">
  <div>{/* drawn numbers 60px · your guess 54px · legenda · dois cards de regra · .ide-table de winners */}</div>
  <aside>{/* hero You won! + Go to claims + pool/winners */}</aside>
</div>
```

## Rewards — `screens/Rewards.tsx`

```jsx
<div className="ide-deck">
  <div>{/* claim hero em linha (valor + Claim JDR à direita) · .ide-metrics is-three · .ide-table de atividade */}</div>
  <aside>{/* Lock JDR: input + Max, weight/unlocks, CTA */}</aside>
</div>
```

## Account — `screens/Profile.tsx`

```jsx
<div className="ide-deck is-account">
  <aside>{/* claim hero, atalho do resultado, .ide-metrics 2×2 */}</aside>
  <div>{/* abas Rules/Conversations/History + .ide-table de regras */}</div>
</div>
```

## Claims — `screens/Claims.tsx`

Filtros viram chips na `.ide-topbar`; os cards viram tabela:

```jsx
<section className="ide-card">{/* total + 3 contadores + Claim all */}</section>
<div className="ide-table" style={{ '--ide-cols': 'minmax(0,1fr) 110px 130px 160px 120px 110px' }}>
  <div className="ide-table-head">…</div>
  {rows.map(r => <div className="ide-table-row">…<span className="is-state is-ok">Claimable</span></div>)}
</div>
```

## My guesses — `screens/Guesses.tsx`

Cards das apostas da rodada em grid de 2 colunas + `.ide-table` "Past rounds".

## Invite — `screens/Invite.tsx`

Link + Copy + Share numa linha, `.ide-table` de convites à esquerda; cartões de
recompensa e totais na coluna de 360px.

## Share / Connect — `screens/Share.tsx`, `screens/Connect.tsx`

Passam a `.ide-overlay-card.is-share` (680px) e `.is-connect` (540px). O bottom
sheet de connect perde a alça no desktop (a camada já centraliza a partir de 768px).
