export interface PrivyConfigurationEnvironment {
  appId: string | undefined;
  deploymentEnvironment: string | undefined;
  nodeEnvironment: string | undefined;
}

/**
 * A local checkout remains usable with external Wallet Standard wallets before
 * a Privy application has been provisioned. A production deployment, however,
 * must never silently ship without email onboarding.
 */
export function resolvePrivyAppId({
  appId,
  deploymentEnvironment,
  nodeEnvironment,
}: PrivyConfigurationEnvironment): string | null {
  const normalizedAppId = appId?.trim() || null;
  if (
    !normalizedAppId &&
    (deploymentEnvironment === "production" || nodeEnvironment === "production")
  ) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is required in production to enable email wallet onboarding.",
    );
  }
  return normalizedAppId;
}
