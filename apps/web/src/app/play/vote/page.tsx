import { RuleVotingPanel } from "../../../features/rule-voting/RuleVotingPanel";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function VotePage() {
  return (
    <SolanaProviders>
      <RuleVotingPanel />
    </SolanaProviders>
  );
}
