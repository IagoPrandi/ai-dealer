import { TokenomicsMultisigApp } from "../../../../features/tokenomics-multisig/TokenomicsMultisigApp";
import { SolanaProviders } from "../../../../solana/SolanaProviders";

export default function TokenomicsMultisigPage() {
  return (
    <SolanaProviders>
      <TokenomicsMultisigApp />
    </SolanaProviders>
  );
}
