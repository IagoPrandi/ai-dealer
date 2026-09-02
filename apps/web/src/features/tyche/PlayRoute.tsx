import type { Screen } from "./context";
import { TycheApp } from "./TycheApp";
import { SolanaProviders } from "../../solana/SolanaProviders";

export function PlayRoute({
  connect = false,
  screen = "home",
}: {
  connect?: boolean;
  screen?: Screen;
}) {
  return (
    <SolanaProviders>
      <TycheApp initialConnect={connect} initialScreen={screen} />
    </SolanaProviders>
  );
}
