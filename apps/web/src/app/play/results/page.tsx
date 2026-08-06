import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayResultsPage() {
  return (
    <SolanaProviders>
      <TycheApp initialScreen="claims" />
    </SolanaProviders>
  );
}
