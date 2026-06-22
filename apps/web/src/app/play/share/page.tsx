import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlaySharePage() {
  return (
    <SolanaProviders>
      <IdealerApp initialScreen="share" />
    </SolanaProviders>
  );
}
