const SOLANA_CHAIN_PREFIX = "solana:";
const SOLANA_FEATURE_PREFIX = "solana:";
const BLOCKED_WALLET_NAME_PARTS = ["metamask"];

type WalletDiscoveryCandidate = Readonly<{
  chains: readonly string[];
  features: Readonly<Record<string, unknown>>;
  name: string;
}>;

function normalizeWalletName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isSupportedTycheWallet(wallet: WalletDiscoveryCandidate) {
  const walletName = normalizeWalletName(wallet.name);
  if (BLOCKED_WALLET_NAME_PARTS.some((part) => walletName.includes(part))) {
    return false;
  }

  const supportsSolanaChain = wallet.chains.some((chain) =>
    chain.startsWith(SOLANA_CHAIN_PREFIX),
  );
  const supportsSolanaFeature = Object.keys(wallet.features).some((feature) =>
    feature.startsWith(SOLANA_FEATURE_PREFIX),
  );

  return supportsSolanaChain && supportsSolanaFeature;
}
