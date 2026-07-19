import { TokenomicsGenesisApp } from "../../../../features/tokenomics-genesis/TokenomicsGenesisApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function TokenomicsGenesisPage() {
  return (
    <SolanaProviders>
      <TokenomicsGenesisApp />
    </SolanaProviders>
  );
}
