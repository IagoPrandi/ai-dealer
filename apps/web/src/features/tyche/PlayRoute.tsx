import type { Screen } from "./context";
import { TycheApp } from "./TycheApp";
import { SolanaProviders } from "../../solana/SolanaProviders";

export function PlayRoute({
  connect = false,
  resultTurnId,
  screen = "home",
}: {
  connect?: boolean;
  resultTurnId?: number;
  screen?: Screen;
}) {
  return (
    <SolanaProviders>
      <TycheApp
        initialConnect={connect}
        initialScreen={screen}
        {...(resultTurnId === undefined ? {} : { initialResultTurnId: resultTurnId })}
      />
    </SolanaProviders>
  );
}
