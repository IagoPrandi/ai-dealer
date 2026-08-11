import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import type { TreasuryOverview } from "../../solana/treasuryBudget";

export function shortAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

export function describeError(error: unknown) {
  if (error instanceof Error) {
    if (/reject|declin/i.test(error.message)) {
      return "The wallet request was rejected. Nothing was submitted.";
    }
    return error.message;
  }
  return String(error);
}

export function formatUnits(value: bigint, decimals = 9) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function memberLabel(address: string) {
  return (
    SQUADS_DEVNET_CONFIG.members.find((member) => member.address === address)
      ?.label ?? shortAddress(address)
  );
}

export function TreasuryNavigation({ current }: { current: "approve" | "request" }) {
  return (
    <nav className="tb-nav" aria-label="Treasury budget">
      <a aria-current={current === "request" ? "page" : undefined} href="/dev/tokenomics/treasury/request">
        Request budget
      </a>
      <a aria-current={current === "approve" ? "page" : undefined} href="/dev/tokenomics/treasury/approve">
        Govern and transfer
      </a>
    </nav>
  );
}

export function TreasuryMetrics({ overview }: { overview: TreasuryOverview | null }) {
  return (
    <div className="tb-metrics" aria-label="Treasury balances">
      <div className="tb-metric">
        <span>Treasury SOL Vault</span>
        <strong>{overview ? formatUnits(overview.treasurySolLamports) : "—"} SOL</strong>
        <small>Available above rent exemption</small>
      </div>
      <div className="tb-metric">
        <span>Locked JDR</span>
        <strong>{overview ? formatUnits(overview.lockedJdrAtoms) : "—"} JDR</strong>
        <small>Treasury lock position</small>
      </div>
      <div className="tb-metric">
        <span>Fee pool</span>
        <strong>{overview ? formatUnits(overview.feePoolLamports) : "—"} SOL</strong>
        <small>Available above rent exemption</small>
      </div>
    </div>
  );
}

export function ExplorerLink({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <a href={`https://explorer.solana.com/${path}?cluster=devnet`} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}
