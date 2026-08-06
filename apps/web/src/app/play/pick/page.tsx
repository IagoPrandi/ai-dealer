import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PlayPickPage() {
  return (
    <SolanaProviders>
      <TycheApp initialScreen="play" />
    </SolanaProviders>
  );
}
