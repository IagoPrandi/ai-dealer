import { TycheVrfConfigApp } from "../../../../features/tyche-vrf-config/TycheVrfConfigApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function TycheVrfConfigPage() {
  return (
    <SolanaProviders>
      <TycheVrfConfigApp />
    </SolanaProviders>
  );
}
