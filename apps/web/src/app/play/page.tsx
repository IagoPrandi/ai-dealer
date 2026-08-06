import { TycheApp } from "../../features/tyche/TycheApp";
import { SolanaProviders } from "../../solana/SolanaProviders";

export default function PlayPage() {
  return (
    <SolanaProviders>
      <TycheApp />
    </SolanaProviders>
  );
}
