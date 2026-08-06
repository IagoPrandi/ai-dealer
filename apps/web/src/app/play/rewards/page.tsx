import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayRewardsPage() {
  return (
    <SolanaProviders>
      <TycheApp initialScreen="rewards" />
    </SolanaProviders>
  );
}
