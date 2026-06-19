import { MobileLiveRoundHub } from "../../features/live-round/MobileLiveRoundHub";
import { SolanaProviders } from "../../solana/SolanaProviders";

export default function PlayPage() {
  return (
    <SolanaProviders>
      <MobileLiveRoundHub />
    </SolanaProviders>
  );
}
