import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayWalletPage() {
  return (
    <SolanaProviders>
      <TycheApp initialConnect />
    </SolanaProviders>
  );
}
