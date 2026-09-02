import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_NAME } from "@tyche/config";

const NAVIGATION = [
  ["Play", "/play"],
  ["Rounds", "/rounds"],
  ["Rules", "/rules"],
  ["Leaderboard", "/leaderboard"],
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-header">
        <Link className="public-brand" href="/play" aria-label={`${BRAND_NAME} live round`}>
          {BRAND_NAME}
        </Link>
        <nav aria-label="Public navigation">
          {NAVIGATION.map(([label, href]) => (
            <Link href={href} key={href}>{label}</Link>
          ))}
        </nav>
        <Link className="public-play-link" href="/play/wallet">Connect wallet</Link>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <span>Public, verifiable game history.</span>
        <Link href="/rounds">Browse the archive</Link>
      </footer>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="public-page-heading">
      <p className="public-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="public-stat"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

export function formatSol(lamports: number) {
  return `${(lamports / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`;
}
