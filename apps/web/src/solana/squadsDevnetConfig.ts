export const SQUADS_DEVNET_CONFIG = Object.freeze({
  cluster: "devnet",
  genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  members: Object.freeze([
    Object.freeze({
      address: "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
      label: "Wallet A",
    }),
    Object.freeze({
      address: "EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW",
      label: "Wallet B",
    }),
    Object.freeze({
      address: "7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p",
      label: "Wallet C",
    }),
  ]),
  permissionMask: 7,
  programId: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  provider: "Squads Protocol v4",
  multisigAddress: "DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD",
  threshold: 2,
  timeLockSeconds: 0,
  vaultAddress: "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
  vaultIndex: 0,
} as const);

export interface MultisigVerificationSnapshot {
  configAuthority: null | string;
  members: ReadonlyArray<{
    address: string;
    permissionMask: number;
  }>;
  owner: string;
  rentCollector: null | string;
  threshold: number;
  timeLockSeconds: number;
}

export function validateSquadsDevnetConfig(): string[] {
  const errors: string[] = [];
  const addresses = SQUADS_DEVNET_CONFIG.members.map(
    (member) => member.address,
  );

  if (SQUADS_DEVNET_CONFIG.cluster !== "devnet") {
    errors.push("The custody configuration must be pinned to devnet.");
  }
  if (new Set(addresses).size !== addresses.length) {
    errors.push("Every multisig member address must be unique.");
  }
  if (
    SQUADS_DEVNET_CONFIG.threshold < 1 ||
    SQUADS_DEVNET_CONFIG.threshold > addresses.length
  ) {
    errors.push("The threshold must be between one and the member count.");
  }
  if (SQUADS_DEVNET_CONFIG.timeLockSeconds !== 0) {
    errors.push("The devnet rehearsal must execute without a time lock.");
  }
  if (SQUADS_DEVNET_CONFIG.permissionMask !== 7) {
    errors.push(
      "Every devnet member must have initiate, vote, and execute permissions.",
    );
  }
  if (
    !SQUADS_DEVNET_CONFIG.multisigAddress ||
    !SQUADS_DEVNET_CONFIG.vaultAddress
  ) {
    errors.push("The finalized devnet multisig and vault must be configured.");
  }

  return errors;
}

export function validateMultisigSnapshot(
  snapshot: MultisigVerificationSnapshot,
): string[] {
  const errors: string[] = [];
  const expectedMembers = new Map<string, number>(
    SQUADS_DEVNET_CONFIG.members.map((member) => [
      member.address,
      SQUADS_DEVNET_CONFIG.permissionMask,
    ]),
  );

  if (snapshot.owner !== SQUADS_DEVNET_CONFIG.programId) {
    errors.push(
      "The multisig account is not owned by the configured Squads v4 program.",
    );
  }
  if (snapshot.configAuthority !== null) {
    errors.push("The multisig must not have a unilateral config authority.");
  }
  if (snapshot.rentCollector !== null) {
    errors.push("The multisig must not have a rent collector.");
  }
  if (snapshot.threshold !== SQUADS_DEVNET_CONFIG.threshold) {
    errors.push("The on-chain approval threshold does not match 2-of-3.");
  }
  if (snapshot.timeLockSeconds !== SQUADS_DEVNET_CONFIG.timeLockSeconds) {
    errors.push("The on-chain time lock is not immediate.");
  }
  if (snapshot.members.length !== expectedMembers.size) {
    errors.push(
      "The on-chain member count does not match the devnet configuration.",
    );
  }

  for (const member of snapshot.members) {
    const expectedPermissionMask = expectedMembers.get(member.address);
    if (expectedPermissionMask === undefined) {
      errors.push(`Unexpected multisig member: ${member.address}.`);
      continue;
    }
    if (member.permissionMask !== expectedPermissionMask) {
      errors.push(
        `Multisig member ${member.address} does not have all permissions.`,
      );
    }
    expectedMembers.delete(member.address);
  }

  for (const missingAddress of expectedMembers.keys()) {
    errors.push(`Missing multisig member: ${missingAddress}.`);
  }

  return errors;
}
