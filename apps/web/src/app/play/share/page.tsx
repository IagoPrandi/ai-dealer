import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlaySharePage() {
  return (
    <SolanaProviders>
      <TycheApp initialScreen="share" />
    </SolanaProviders>
  );
}
