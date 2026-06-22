import { IdealerApp } from "../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../solana/SolanaProviders";

export default function PlayPage() {
  return (
    <SolanaProviders>
      <IdealerApp />
    </SolanaProviders>
  );
}
