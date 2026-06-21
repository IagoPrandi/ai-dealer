"use client";

/**
 * Galeria de validação de UI — renderiza TODAS as telas de uma vez, lado a lado,
 * já no estado "carregado", sem backend, devnet ou carteira.
 *
 * Só funciona com o flag de mock ligado:  npm run dev:mock
 * Depois acesse:  http://localhost:3000/dev/gallery
 *
 * Como funciona: em modo mock o next.config.ts troca "@solana/react-hooks" pelo
 * mock local (carteira conectada + client falso) e esta página intercepta fetch
 * para responder a API com dados canned.
 */
import { Component, type ReactNode } from "react";

import { installMockFetch } from "../../../dev/mock/mockFetch";
import { DrawResultPanel } from "../../../features/draw-result/DrawResultPanel";
import { MobileLiveRoundHub } from "../../../features/live-round/MobileLiveRoundHub";
import { NumberPicker } from "../../../features/number-picker/NumberPicker";
import { RoundPage } from "../../../features/round-page/RoundPage";
import { RuleProposalComposer } from "../../../features/rule-proposal/RuleProposalComposer";
import { RuleVotingPanel } from "../../../features/rule-voting/RuleVotingPanel";
import { ShareCardGenerator } from "../../../features/share-card/ShareCardGenerator";
import { TurnCycleSimulator } from "../../../features/turn-cycle/TurnCycleSimulator";
import { WalletFlow } from "../../../features/wallet/WalletFlow";

// Instala a interceptação de fetch antes de qualquer efeito das telas.
if (typeof window !== "undefined") {
  installMockFetch();
}

const MOCK_ENABLED = process.env.NEXT_PUBLIC_UI_MOCK === "1";

class CardBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gx-error">
          <strong>Erro ao renderizar</strong>
          <span>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

const CARDS: Array<{ label: string; node: ReactNode; route: string }> = [
  { label: "Live round hub", node: <MobileLiveRoundHub />, route: "/play" },
  { label: "Number picker", node: <NumberPicker />, route: "/play/pick" },
  {
    label: "Rule proposal (dealer chat)",
    node: <RuleProposalComposer />,
    route: "/play/propose",
  },
  { label: "Rule voting", node: <RuleVotingPanel />, route: "/play/vote" },
  { label: "Wallet flow", node: <WalletFlow />, route: "/play/wallet" },
  { label: "Draw result", node: <DrawResultPanel />, route: "/play/results" },
  { label: "Share card", node: <ShareCardGenerator />, route: "/play/share" },
  {
    label: "Turn cycle simulator",
    node: <TurnCycleSimulator />,
    route: "/play/simulate",
  },
  { label: "Round page", node: <RoundPage turnId="7" />, route: "/round/7" },
];

export default function GalleryPage() {
  if (!MOCK_ENABLED) {
    return (
      <main className="gx-disabled">
        <h1>Galeria de UI desativada</h1>
        <p>
          Esta página só funciona em modo mock. Rode o servidor com:
          <code>npm run dev:mock</code>
          (na pasta <code>apps/web</code>) e acesse novamente
          <code>/dev/gallery</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="gx-root">
      <style>{GALLERY_CSS}</style>
      <header className="gx-top">
        <h1>Idealer — galeria de telas</h1>
        <p>
          Todas as telas com estado já carregado (carteira conectada, rodada
          aberta, dados canned). Sem backend, devnet ou execução de funções.
          Cada moldura é interativa, mas ações on-chain ficam desativadas.
        </p>
      </header>
      <div className="gx-grid">
        {CARDS.map((card) => (
          <section className="gx-card" key={card.route}>
            <div className="gx-label">
              <span>{card.label}</span>
              <code>{card.route}</code>
            </div>
            <div className="gx-frame">
              <CardBoundary>{card.node}</CardBoundary>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

const GALLERY_CSS = `
.gx-root {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(1200px 800px at 50% -8%, #2a2533 0%, #1a1722 55%, #131019 100%);
  color: #f4f1fa;
  font-family: 'Outfit', system-ui, sans-serif;
}
.gx-top { max-width: 720px; margin: 0 auto 28px; text-align: center; }
.gx-top h1 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.gx-top p { margin: 0; font-size: 14px; line-height: 1.5; color: #a39cb6; }
.gx-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(402px, 1fr));
  gap: 40px 28px;
  justify-items: center;
  align-items: start;
}
.gx-card { display: flex; flex-direction: column; gap: 12px; width: 402px; }
.gx-label {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 13px; font-weight: 600;
}
.gx-label code {
  font-size: 11px; color: #c77dff; font-weight: 500;
  background: rgba(199,125,255,0.12); border: 1px solid rgba(199,125,255,0.28);
  padding: 2px 8px; border-radius: 999px;
}
.gx-frame {
  width: 402px; height: 868px; overflow: auto; position: relative;
  border-radius: 24px; box-shadow: 0 30px 70px -30px rgba(0,0,0,0.7);
  background: var(--platform-bg, #0b0910);
}
.gx-frame::-webkit-scrollbar { width: 0; height: 0; }
.gx-frame { scrollbar-width: none; }
/* telas que já trazem a moldura de celular: não deixar encolher dentro do frame */
.gx-frame .platform-phone-shell { max-width: none; max-height: none; }
.gx-error {
  display: flex; flex-direction: column; gap: 8px; justify-content: center;
  height: 100%; padding: 24px; text-align: center;
  color: #ff8a8a; font: 13px/1.5 ui-monospace, monospace;
}
.gx-disabled {
  min-height: 100vh; display: grid; place-content: center; gap: 12px;
  padding: 40px; text-align: center; color: #f4f1fa; background: #0b0910;
  font-family: 'Outfit', system-ui, sans-serif;
}
.gx-disabled code {
  display: inline-block; margin: 0 6px; padding: 2px 8px; border-radius: 6px;
  background: rgba(255,255,255,0.08); color: #14f195;
}
`;
