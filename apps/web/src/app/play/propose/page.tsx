import { RuleProposalComposer } from "../../../features/rule-proposal/RuleProposalComposer";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function ProposeRulePage() {
  return (
    <SolanaProviders>
      <RuleProposalComposer />
    </SolanaProviders>
  );
}
