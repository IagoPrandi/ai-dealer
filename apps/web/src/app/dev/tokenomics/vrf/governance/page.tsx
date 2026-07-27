import { IdealerVrfConfigGovernanceApp } from "../../../../../features/idealer-vrf-config-governance/IdealerVrfConfigGovernanceApp";
import { SolanaProviders } from "../../../../../solana/SolanaProviders";

export default function IdealerVrfConfigGovernancePage() {
  return (
    <SolanaProviders>
      <IdealerVrfConfigGovernanceApp />
    </SolanaProviders>
  );
}
