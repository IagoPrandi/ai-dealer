import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayRewardsPage() {
  return (
    <SolanaProviders>
      <IdealerApp initialScreen="rewards" />
    </SolanaProviders>
  );
}
