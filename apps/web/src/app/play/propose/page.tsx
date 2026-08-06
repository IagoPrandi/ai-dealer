import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayProposePage() {
  return (
    <SolanaProviders>
      <TycheApp initialScreen="create" />
    </SolanaProviders>
  );
}
