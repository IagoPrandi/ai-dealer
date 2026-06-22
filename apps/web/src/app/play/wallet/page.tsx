import { IdealerApp } from "../../../features/idealer/IdealerApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayWalletPage() {
  return (
    <SolanaProviders>
      <IdealerApp initialConnect />
    </SolanaProviders>
  );
}
