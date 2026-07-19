import { TokenomicsUpgradeApp } from "../../../../features/tokenomics-upgrade/TokenomicsUpgradeApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function TokenomicsUpgradePage() {
  return (
    <SolanaProviders>
      <TokenomicsUpgradeApp />
    </SolanaProviders>
  );
}
