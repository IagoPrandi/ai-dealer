"use client";

/**
 * Galeria de validação de UI — renderiza as telas do Idealer lado a lado, já no
 * estado "carregado", sem backend, devnet ou carteira real.
 *
 * Só funciona com o flag de mock ligado:  npm run dev:mock
 * Depois acesse:  http://localhost:3000/dev/gallery
 *
 * Em modo mock o next.config.ts troca "@solana/react-hooks" pelo mock local
 * (carteira conectada + client falso) e esta página intercepta fetch para
 * responder a API com dados canned.
 */
import { Component, type ReactNode } from "react";

import { installMockFetch } from "../../../dev/mock/mockFetch";
import { IdealerApp } from "../../../features/idealer/IdealerApp";
import type { Screen } from "../../../features/idealer/context";
import { SolanaProviders } from "../../../solana/SolanaProviders";

if (typeof window !== "undefined") {
  installMockFetch();
}

const MOCK_ENABLED = process.env.NEXT_PUBLIC_UI_MOCK === "1";

class CardBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
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

const CARDS: Array<{ label: string; screen: Screen }> = [
  { label: "Round (home)", screen: "home" },
  { label: "Play (number picker)", screen: "play" },
  { label: "Rules (voting)", screen: "vote" },
  { label: "Create rule (dealer chat)", screen: "create" },
  { label: "Stake & earn", screen: "rewards" },
  { label: "Account (claims)", screen: "profile" },
  { label: "Result", screen: "result" },
];

export default function GalleryPage() {
  if (!MOCK_ENABLED) {
    return (
      <main className="gx-disabled">
        <h1>UI gallery disabled</h1>
        <p>
          This page only works in mock mode. Start the server with
          <code>npm run dev:mock</code> (in <code>apps/web</code>) and open
          <code>/dev/gallery</code> again.
        </p>
      </main>
    );
  }

  return (
    <main className="gx-root">
      <style>{GALLERY_CSS}</style>
      <header className="gx-top">
        <h1>Idealer — screen gallery</h1>
        <p>
          Every screen with state already loaded (wallet connected, round open,
          canned data). No backend, devnet, or on-chain execution. Each frame is
          interactive, but on-chain actions are disabled.
        </p>
      </header>
      <SolanaProviders>
        <div className="gx-grid">
          {CARDS.map((card) => (
            <section className="gx-card" key={card.screen}>
              <div className="gx-label">
                <span>{card.label}</span>
                <code>{card.screen}</code>
              </div>
              <div className="gx-frame">
                <CardBoundary>
                  <IdealerApp initialScreen={card.screen} />
                </CardBoundary>
              </div>
            </section>
          ))}
        </div>
      </SolanaProviders>
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
  width: 402px; height: 868px; overflow: hidden; position: relative;
  border-radius: 24px; box-shadow: 0 30px 70px -30px rgba(0,0,0,0.7);
  background: #0b0910;
}
/* the screens already include a device frame; don't shrink inside the card */
.gx-frame .ide-stage { padding: 0; min-height: 868px; }
.gx-frame .ide-phone-shell { width: 402px; height: 868px; max-width: none; max-height: none; border-radius: 0; box-shadow: none; aspect-ratio: auto; }
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
