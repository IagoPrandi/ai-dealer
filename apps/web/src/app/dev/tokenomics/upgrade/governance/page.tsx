import { TokenomicsUpgradeGovernanceApp } from "../../../../../features/tokenomics-upgrade-governance/TokenomicsUpgradeGovernanceApp";
import { SolanaProviders } from "../../../../../solana/SolanaProviders";

export default function TokenomicsUpgradeGovernancePage() {
  return (
    <SolanaProviders>
      <TokenomicsUpgradeGovernanceApp />
    </SolanaProviders>
  );
}
