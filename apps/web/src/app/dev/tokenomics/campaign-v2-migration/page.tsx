import { TokenomicsCampaignV2MigrationApp } from "../../../../features/tokenomics-campaign-v2-migration/TokenomicsCampaignV2MigrationApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function TokenomicsCampaignV2MigrationPage() {
  return (
    <SolanaProviders>
      <TokenomicsCampaignV2MigrationApp />
    </SolanaProviders>
  );
}
