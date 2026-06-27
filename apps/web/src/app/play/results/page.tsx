import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayResultsPage() {
  return (
    <SolanaProviders>
      <IdealerApp initialScreen="claims" />
    </SolanaProviders>
  );
}
