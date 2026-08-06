import { TycheVrfConfigGovernanceApp } from "../../../../../features/tyche-vrf-config-governance/TycheVrfConfigGovernanceApp";
import { SolanaProviders } from "../../../../../solana/SolanaProviders";

export default function TycheVrfConfigGovernancePage() {
  return (
    <SolanaProviders>
      <TycheVrfConfigGovernanceApp />
    </SolanaProviders>
  );
}
