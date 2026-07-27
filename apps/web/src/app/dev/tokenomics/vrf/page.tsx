import { IdealerVrfConfigApp } from "../../../../features/idealer-vrf-config/IdealerVrfConfigApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function IdealerVrfConfigPage() {
  return (
    <SolanaProviders>
      <IdealerVrfConfigApp />
    </SolanaProviders>
  );
}
