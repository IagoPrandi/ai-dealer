import { WalletFlow } from "../../../features/wallet/WalletFlow";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function WalletPage() {
  return (
    <SolanaProviders>
      <WalletFlow />
    </SolanaProviders>
  );
}
