import { PlayerRewardsHistory } from "../../../features/rewards-history/PlayerRewardsHistory";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function RewardsPage() {
  return (
    <SolanaProviders>
      <PlayerRewardsHistory />
    </SolanaProviders>
  );
}
