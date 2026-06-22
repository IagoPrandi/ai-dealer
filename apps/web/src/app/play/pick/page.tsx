import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayPickPage() {
  return (
    <SolanaProviders>
      <IdealerApp initialScreen="play" />
    </SolanaProviders>
  );
}
