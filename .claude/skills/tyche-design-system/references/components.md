# Componentes — receitas com valores literais

Valores copiados das telas em `screens-html/`. Use-os como estão. Onde houver variação
legítima entre telas, ela está anotada. Todo `box-shadow` de contorno é `inset`, nunca `border`.

---

## Botões

### CTA primário (full width)
```
width: 100%; padding: 13px;                     /* 16px em CTA fixo de rodapé */
border: none; border-radius: 24px;              /* 20px dentro de cartão/modal */
background: #FFD23F; color: #170B22;
font-family: Bevan, serif; font-size: 18px;     /* 16–17px em cartão/modal */
letter-spacing: .06em–.08em; text-transform: uppercase;
box-shadow: 5px 5px 0 #FF6A1F, 0 0 26px -6px rgba(53,240,224,.45);
```
Só **um** por tela. Com sombra sólida à direita, reserve `margin-right: 3px`.
Desabilitado: `opacity: .45` e o rótulo passa a dizer o que falta ("2 numbers left").

### Botão fantasma ciano (ação secundária)
```
width: 100%; padding: 13px; border: none; border-radius: 999px;
background: #0F0618B3; color: #F1E8D6;
font-family: Oswald, sans-serif; font-size: 14px; font-weight: 600;
letter-spacing: .14em; text-transform: uppercase;
box-shadow: inset 0 0 0 1.5px rgba(53,240,224,.55),
            0 0 34px -10px rgba(53,240,224,.55),
            0 0 66px -18px rgba(53,240,224,.4);
```
Variante neutra/magenta (terciária, ex. "Back to the round"):
`box-shadow: 0 0 0 1.5px rgba(241,232,214,.6), 0 0 34px -10px rgba(53,240,224,.5), 0 0 64px -18px rgba(255,46,136,.45)`.

### Botão pílula pequeno (Connect, Copy, Apply)
```
padding: 10px 16px; border: none; border-radius: 999px;
background: #FFD23F; color: #170B22;
font-family: Oswald, sans-serif; font-size: 13px; font-weight: 600;
letter-spacing: .14em; text-transform: uppercase;
box-shadow: 4px 4px 0 #FF6A1F, 0 0 34px rgba(255,46,136,.5);
```
Variante contorno (Max, Apply): fundo transparente + `inset 0 0 0 1.5px rgba(53,240,224,.5)`, texto `#35F0E0`.

### Ícone-botão de envio (seta)
```
width: 46px; height: 46px; flex-shrink: 0; margin-right: 3px;
border: none; border-radius: 14px; background: #FFD23F;
display: grid; place-items: center;
box-shadow: 4px 4px 0 #FF6A1F;
```
Ícone: `<svg viewBox="0 0 24 24" width="19" height="19">` seta `stroke-width: 2.4`, cor `#170B22`.

### Ícone-botão quadrado (voltar, fechar, compartilhar)
```
width: 38px; height: 38px;                       /* 32px para fechar em modal */
display: grid; place-items: center;
background: #0F0618; color: #F1E8D6;
box-shadow: inset 0 0 0 1.5px rgba(241,232,214,.25);
```
Variante ciano (compartilhar): `inset 0 0 0 1.5px rgba(53,240,224,.4)`, cor `#35F0E0`.
Ícone 17–18 px, `stroke-width: 1.7–2`.

### Botão de voto
```
a favor:  padding: 8px 12px; background: transparent; color: #35F0E0;
          box-shadow: inset 0 0 0 1.5px rgba(53,240,224,.5);
contra:   color: #FF3B2F; box-shadow: inset 0 0 0 1.5px rgba(255,59,47,.45);
tipografia: Oswald 600, 11.5px, letter-spacing .12em, uppercase
rótulo: "▲ in favor · free" / "▼ 0.002"
```

---

## Cartões

### Cartão destacado (com sombra sólida)
```
padding: 14–16px; margin: 0 3px 12px 0; background: #120A1B;
box-shadow: 5px 5px 0 #FF6A1F, 0 0 50px -12px rgba(53,240,224,.5);
border-radius: 0;
```
Cor da sombra por significado: laranja = ação/valor · `#35F0E0` = informação ·
`rgba(255,46,136,.5)` = pergunta/marca · `#FFD23F` = regra eleita.

### Cartão de lista (linha)
```
display: flex; align-items: center; gap: 12px;
padding: 8–13px 13px; background: #0F0618;
box-shadow: inset 0 0 0 1.5px rgba(241,232,214,.2);
```
Item em destaque (1º da lista): `inset 0 0 0 1.5px rgba(255,46,136,.5), 5px 5px 0 #35F0E0`.

### Bloco de stat (par lado a lado)
```
display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
cada bloco: padding: 11–14px 13–14px; background: #1E1226 (modal) ou #0F0618 (tela);
            contorno opcional por estado: neutro rgba(241,232,214,.18) /
            ciano rgba(53,240,224,.35) / amarelo rgba(255,210,63,.4)
rótulo: DM Mono 10px, letter-spacing .16em, uppercase, #7E6A94
valor:  Bevan 20–21px, #F1E8D6 (verde #7CF6B8 quando positivo)
unidade: DM Mono 11px, #35F0E0
```

### Nota informativa
```
display: flex; align-items: center; gap: 9px; padding: 12px 14px;
background: #120A1B; box-shadow: 4px 4px 0 rgba(53,240,224,.6);
ícone info 17px ciano, flex-shrink: 0
texto: Archivo 12.5–13px, line-height 1.45, #A88FBF
```

### Cartão de gate (bloqueado)
Cartão destacado + ícone cadeado em quadrado `#1E1226` 38×38, título Oswald uppercase,
explicação Archivo `#A88FBF`, CTA primário pequeno. Usado quando falta o round pass.

---

## Tipografia aplicada

| Papel | Receita |
| --- | --- |
| Wordmark | Bevan 26px, `letter-spacing: .04em`, uppercase, `#F1E8D6`, chapa `-2px/2px` |
| Título de tela | Bevan 24px (22–30 aceitável), uppercase, chapa `-2px/2px` |
| Título de seção | Bevan 24px + régua `flex:1; height:2px; background: rgba(241,232,214,.3)` + link DM Mono 11px amarelo |
| Rótulo de seção | Oswald 600, 11px, `letter-spacing: .22em`, uppercase, `#35F0E0` |
| Eyebrow de estado | Oswald 700, 12px, `letter-spacing: .30em`, uppercase (amarelo em vitória, ciano em round) |
| Nome de item | Oswald 500, 15.5px, `letter-spacing: .04em`, uppercase, `#F1E8D6`, ellipsis |
| Parágrafo | Archivo 13–13.5px, `line-height: 1.5`, `#A88FBF`; ênfase em `#F1E8D6` |
| Número grande | Bevan 40–70px, `line-height: .92–1`, chapa `-3px/3px` + glow |
| Decimal do número | Bevan 34px, `#FFD23F`, `margin-top: 16px`, glow amarelo |
| Unidade (SOL/JDR) | DM Mono 12–13px, `letter-spacing: .16em`, `#35F0E0`, `margin-top: 14–22px` |
| Timer / id / hash | DM Mono 12.5–14px, `letter-spacing: .12em` |
| Tally | DM Mono 11.5px: `▲ n` em `#35F0E0`, `· ▼ n` em `#7E6A94` (zero) ou `#FF3B2F` |

---

## Fichas de número (quatro estados)

| Estado | Receita |
| --- | --- |
| Escolhido | `background: #FFD23F; color: #170B22; box-shadow: 3px 3px 0 #FF6A1F` |
| Livre (grade) | transparente, `color: #C6B6D6`, `box-shadow: inset 0 0 0 1.2px rgba(241,232,214,.16)` |
| Sorteado | `background: #F1E8D6; color: #170B22; box-shadow: 3–4px 0 #FF2E88` |
| Acertado | `background: #35F0E0; color: #062220; box-shadow: 3px 3px 0 #FF6A1F` |

Tamanhos: 36 (histórico) · 42 (modal/resultado) · 44 (slot/sorteio) · 46 (revisão).
Sempre `display: grid; place-items: center`, DM Mono 13–17px, `border-radius: 0`.

Grade de seleção: `display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;`
células com `aspect-ratio: 1`, DM Mono 13px.

Índice/medalha de lista: `width: 30px; height: 30px; display: grid; place-items: center;`
Bevan 13px. 1º `background: #FFD23F; color: #170B22`; 2º contorno osso
`inset 0 0 0 1.5px rgba(241,232,214,.4)`; 3º `#FF9B4A`; demais contorno neutro.

---

## Badges e chips

### Badge inclinado (ao vivo, settled)
```
container: display: inline-flex; align-items: center; gap: 9px;
           padding: 7px 20px; background: #E8231A; transform: skewX(-10deg);
           font-family: Oswald; font-weight: 600; font-size: 12.5px;
           letter-spacing: .2em; text-transform: uppercase; color: #FFE9A3;
           box-shadow: 0 0 34px rgba(255,59,47,.6);
conteúdo:  cada filho com transform: skewX(10deg)
ponto:     8×8 #FFE9A3, animation: rb-pulse 2.2s ease-in-out infinite
```

### Chip de marcação ("with AI")
```
padding: 4px 10px; background: #35F0E0; color: #170B22;
font-family: Oswald; font-weight: 600; font-size: 9–10.5px;
letter-spacing: .18em; text-transform: uppercase; border-radius: 0;
```

### Badge de status em lista
Retângulo `padding: 4px 9px`, Oswald 600 10px `.16em` uppercase.
`Claimable` verde `#7CF6B8` sobre `rgba(124,246,184,.14)` ·
`Pending` amarelo `#FFD23F` sobre `rgba(255,210,63,.14)` ·
`Confirmed` verde · `Eliminated` vermelho `#FF6E63` (item com `line-through` e `opacity: .65`).

---

## Input

```
flex: 1; min-width: 0; padding: 13px 14px; background: #1E1226;
font-family: 'DM Mono', monospace; font-size: 12.5px; color: #A992BF;
border: none; border-radius: 0; outline: none;
```
Texto preenchido em `#F1E8D6`. Sempre em `display: flex; gap: 9px` com o botão de ação ao lado.

---

## Divisores

**Tracejado com losango** (entre título e valor, marcador de época):
```
<span style="flex:1; height:4px; border-radius:999px;
  background: repeating-linear-gradient(90deg, #F1E8D6 0 6px, transparent 6px 10px)"></span>
<span style="width:9px; height:9px; transform: rotate(45deg); background:#FFD23F;
  box-shadow: 0 0 16px rgba(255,210,63,.9)"></span>
<span …mesmo tracejado…></span>
```
Versão fina (3 px, `rgba(241,232,214,.6) 0 5px`) quando ao lado de rótulo Oswald.

**Divisor de lista:** `border-bottom: 1px solid rgba(241,232,214,.14)`, linhas com
`padding: 13px 2px` — este é o único uso legítimo de `border`.

**Filete de seção:** `border-top/bottom: 1px solid rgba(241,232,214,.16)`, `padding: 14px 0 16px`.

---

## Abas

```
trilho: display: flex; gap: 18px; box-shadow: inset 0 -2px 0 rgba(241,232,214,.18);
aba:    padding: 10px 2px; Oswald 600 13px, letter-spacing .1em, uppercase
ativa:  color: #FFD23F; box-shadow: inset 0 -3px 0 #FFD23F
inativa: color: #7E6A94
```
Contagem no rótulo: `In voting · 12`.

---

## Barra de progresso

```
trilho:      height: 8px; background: rgba(255,59,47,.35);   /* votação */
             height: 8px; background: rgba(241,232,214,.14); /* dificuldade */
preenchimento: height: 100%; width: <pct>%;
             background: #35F0E0; box-shadow: 0 0 18px rgba(53,240,224,.8);
             /* magenta #FF2E88 + glow magenta na dificuldade */
```
Sem `border-radius`. Percentual ao lado em DM Mono 11.5px `#FFD23F`.

---

## Bolhas de conversa

```
usuário: justify-self: end; max-width: 78%; padding: 12px 14px;
         background: #FFD23F; color: #170B22; Archivo 13.5px/1.45;
         box-shadow: 4px 4px 0 #FF6A1F;
IA:      max-width: 88%; padding: 13px 15px; background: #120A1B;
         box-shadow: 4px 4px 0 rgba(53,240,224,.55);   /* explicação */
         box-shadow: 4px 4px 0 rgba(255,46,136,.5);    /* perguntas */
         rótulo Oswald 600 10.5px .2em uppercase (ciano / #FF7AB8)
         corpo Archivo 13px/1.5 #E4DACB
lista numerada: `01`/`02` em DM Mono #FFD23F, `display: flex; gap: 8px`
```
Pilha: `display: grid; gap: 12px`.

---

## Modal centralizado

```
overlay: position: absolute; inset: 0; z-index: 30;
         background: rgba(6,4,10,.72); backdrop-filter: blur(6px);
modal:   position: absolute; z-index: 40; left: 18px; right: 18px;
         top: 50%; transform: translateY(-50%); padding: 18px 18px 20px;
         background: #120A1B;
         box-shadow: 6px 6px 0 #FF6A1F, 0 0 70px -14px rgba(255,46,136,.6);
título:  Bevan 26px, line-height 1.05, chapa
```
Topo: badge inclinado à esquerda + botão fechar 32×32 à direita.

## Bottom sheet

```
overlay: rgba(6,4,10,.7) + blur(6px) + glow magenta radial no topo
         (radial-gradient(70% 40% at 50% 24%, rgba(255,46,136,.35), transparent))
sheet:   position: absolute; left: 0; right: 0; bottom: 0; padding: 18px;
         background: #120A1B;
         box-shadow: 0 -6px 0 #FF6A1F, 0 -40px 90px -20px rgba(255,46,136,.55);
alça:    44×5, border-radius: 3px, rgba(241,232,214,.35), centralizada
título:  Bevan 23px + subtítulo DM Mono 11.5px #A88FBF
linhas:  ícone 38×38 em #1E1226 + nome Oswald 15 uppercase + ação DM Mono 12px
         item destacado: 5px 5px 0 #35F0E0, ação em #35F0E0
```

---

## Tab bar (5 itens)

```
container: position: absolute; left: 0; right: 0; bottom: 0; z-index: 40;
           display: flex; align-items: center; justify-content: space-around;
           padding: 12px 20px 18px; background: #0C0512;
           box-shadow: inset 0 1px 0 rgba(241,232,214,.22),
                       0 -40px 80px -30px rgba(255,46,136,.5);
item:      display: flex; flex-direction: column; align-items: center; gap: 4px;
           min-width: 50px; DM Mono 9.5px, letter-spacing .1em, uppercase
           ativo #FF2E88 · inativo #7E6A94; ícone 21×21 stroke 1.8
FAB:       width: 52px; height: 52px; margin-top: -22px; border-radius: 22px;
           background: #FFD23F; color: #170B22; display: grid; place-items: center;
           box-shadow: 4px 4px 0 #FF6A1F, 0 0 34px -6px rgba(255,46,136,.55);
```
Ordem fixa: Round · Rules · FAB `+` · Rewards · Account.

---

## Raios do prêmio (só no hero da home)

Dois `repeating-conic-gradient` de 1000×1000 px centralizados e mascarados:
```
1) repeating-conic-gradient(from 0deg at 50% 50%,
     rgba(255,46,136,.42) 0deg 5deg, transparent 5deg 12deg); opacity: .85
2) mesmo padrão com rgba(53,240,224,.28) 0deg 4deg / transparent 4deg 14deg,
   rotate(6deg)
máscara de cada um: radial-gradient(closest-side, #000 30%, rgba(0,0,0,.5) 60%, transparent 78%)
máscara do container: linear-gradient(180deg, transparent 0, #000 16%, #000 82%, transparent 100%)
```
Glow por trás do número: `radial-gradient(50% 50% at 50% 50%, rgba(255,46,136,.75),
rgba(53,240,224,.35) 55%, transparent 78%)`, `filter: blur(26px)`, 300×120.
Em tela de sucesso o glow vira amarelo: `rgba(255,210,63,.55)`, `blur(28px)`.

Sempre `pointer-events: none` e atrás do conteúdo.

---

## Ícones

SVG inline, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width` 1.6–2.4, tamanho 15–22 px. Nenhum ícone preenchido.
No repo, use o icon set existente (`Ico.*` em `features/tyche/shared`) mantendo peso e tamanho.
