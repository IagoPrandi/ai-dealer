import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayProposePage() {
  return (
    <SolanaProviders>
      <IdealerApp initialScreen="create" />
    </SolanaProviders>
  );
}
