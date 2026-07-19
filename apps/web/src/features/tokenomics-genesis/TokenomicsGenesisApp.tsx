"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import {
  TOKENOMICS_GENESIS_CONFIG,
  validateTokenomicsGenesisConfig,
} from "../../solana/tokenomicsGenesisConfig";
import {
  type PreparedTokenomicsGenesis,
  type TokenomicsGenesisResult,
  type TokenomicsGenesisSummary,
  prepareTokenomicsGenesis,
  signSimulateSendAndVerifyGenesis,
} from "../../solana/tokenomicsGenesisProvisioning";
import "../tokenomics-multisig/tokenomics-multisig.css";
import "./tokenomics-genesis.css";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const WALLET_A = SQUADS_DEVNET_CONFIG.members[0]!;

function formatSol(lamports: bigint) {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} SOL` : `${whole} SOL`;
}

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    if (/reject|declin|cancel/i.test(error.message)) {
      return "The Phantom request was rejected. Nothing was submitted.";
    }
    return error.message;
  }
  return String(error);
}

function ExplorerLink({
  children,
  path,
}: {
  children: React.ReactNode;
  path: string;
}) {
  return (
    <a
      href={`https://explorer.solana.com/${path}?cluster=devnet`}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function GenesisReview({ summary }: { summary: TokenomicsGenesisSummary }) {
  const { addresses } = summary;
  return (
    <section className="tm-card tm-review" aria-labelledby="genesis-review">
      <div className="tm-section-heading">
        <div>
          <p className="tm-eyebrow">Required review</p>
          <h2 id="genesis-review">Atomic genesis transaction</h2>
        </div>
        <span className="tm-status tm-status-ready">Prepared</span>
      </div>

      <dl className="tm-details tg-details">
        <div>
          <dt>Cluster</dt>
          <dd>Solana devnet</dd>
        </div>
        <div>
          <dt>Fee payer</dt>
          <dd>Wallet A · {shortAddress(WALLET_A.address)}</dd>
        </div>
        <div>
          <dt>Estimated account rent</dt>
          <dd>{formatSol(summary.estimatedRentLamports)}</dd>
        </div>
        <div>
          <dt>Wallet A balance</dt>
          <dd>{formatSol(summary.payerBalanceLamports)}</dd>
        </div>
        <div>
          <dt>Token mint</dt>
          <dd title={addresses.mint}>{shortAddress(addresses.mint)}</dd>
        </div>
        <div>
          <dt>Metadata account</dt>
          <dd title={addresses.metadata}>{shortAddress(addresses.metadata)}</dd>
        </div>
        <div>
          <dt>Initial campaign vault</dt>
          <dd title={addresses.campaignVault}>
            {shortAddress(addresses.campaignVault)}
          </dd>
        </div>
        <div>
          <dt>Treasury lock escrow</dt>
          <dd title={addresses.treasuryEscrow}>
            {shortAddress(addresses.treasuryEscrow)}
          </dd>
        </div>
        <div>
          <dt>Governance</dt>
          <dd title={TOKENOMICS_GENESIS_CONFIG.governance}>
            Squads vault · {shortAddress(TOKENOMICS_GENESIS_CONFIG.governance)}
          </dd>
        </div>
        <div>
          <dt>Program upgrade authority</dt>
          <dd title={summary.programUpgradeAuthority}>
            {shortAddress(summary.programUpgradeAuthority)}
          </dd>
        </div>
      </dl>

      <div className="tg-uri">
        <span>Immutable transaction input · metadata URI</span>
        <code>{summary.metadataUri}</code>
      </div>
      <p className="tm-note">
        The one-time mint signer exists only in this browser tab. The
        transaction creates Metaplex metadata, mints the complete supply,
        allocates 200M/800M, locks the 800M reserve, and revokes mint and freeze
        authority atomically.
      </p>
    </section>
  );
}

export function TokenomicsGenesisApp() {
  const client = useSolanaClient();
  const cluster = useClusterState();
  const {
    connect,
    connected,
    connecting,
    connectors,
    disconnect,
    isReady,
    wallet,
  } = useWalletConnection();
  const preparedRef = useRef<PreparedTokenomicsGenesis | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? null;
  const walletName = wallet?.connector.name ?? null;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "submitting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TokenomicsGenesisResult | null>(null);
  const [summary, setSummary] = useState<TokenomicsGenesisSummary | null>(null);
  const configErrors = useMemo(() => validateTokenomicsGenesisConfig(), []);

  const phantomConnector = useMemo(
    () =>
      connectors.find((connector) =>
        connector.name.toLowerCase().includes("phantom"),
      ),
    [connectors],
  );
  const isWalletA = walletAddress === WALLET_A.address;
  const isPhantom = walletName?.toLowerCase().includes("phantom") ?? false;
  const connectionValid = connected && isWalletA && isPhantom;

  useEffect(() => {
    preparedRef.current = null;
    setAccepted(false);
    setError(null);
    setResult(null);
    setSummary(null);
  }, [walletAddress, walletName]);

  async function prepare() {
    if (!walletAddress || !connectionValid || configErrors.length > 0) {
      return;
    }
    setBusy("preparing");
    setError(null);
    try {
      const prepared = await prepareTokenomicsGenesis({
        payerAddress: walletAddress,
        rpcEndpoint: cluster.endpoint.toString(),
      });
      preparedRef.current = prepared;
      setSummary(prepared.summary);
    } catch (prepareError) {
      preparedRef.current = null;
      setSummary(null);
      setError(describeError(prepareError));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const prepared = preparedRef.current;
    if (!wallet || !prepared || !accepted) {
      return;
    }
    setBusy("submitting");
    setError(null);
    try {
      const created = await signSimulateSendAndVerifyGenesis({
        client,
        prepared,
        wallet,
      });
      preparedRef.current = null;
      setResult(created);
      setSummary(created);
      setAccepted(false);
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="tm-shell">
      <div className="tm-glow" aria-hidden="true" />
      <div className="tm-layout">
        <header className="tm-hero">
          <div className="tm-brand">
            <span className="tm-brand-mark">J</span>
            <span>JUSDEALER operations</span>
          </div>
          <span className="tm-network">Devnet only</span>
          <p className="tm-eyebrow">Token genesis · M10</p>
          <h1>Create the fixed JDR supply</h1>
          <p className="tm-lead">
            One reviewed transaction creates the classic SPL mint and metadata,
            issues exactly one billion JDR, funds the campaign reserve, locks
            the creator reserve, and permanently closes future minting.
          </p>
        </header>

        <section className="tm-card" aria-labelledby="allocation-title">
          <div className="tm-section-heading tg-allocation-heading">
            <div>
              <p className="tm-eyebrow">Fixed allocation</p>
              <h2 id="allocation-title">1,000,000,000 JDR · 9 decimals</h2>
            </div>
            <span className="tm-status">Classic SPL</span>
          </div>
          <div className="tg-allocations">
            <article>
              <span>Initial campaign reserve</span>
              <strong>200,000,000 JDR</strong>
              <small>20% · programme-controlled</small>
            </article>
            <article>
              <span>Creator treasury reserve</span>
              <strong>800,000,000 JDR</strong>
              <small>80% · locked at genesis</small>
            </article>
          </div>
          <div className="tm-facts">
            <span>Mint authority → None</span>
            <span>Freeze authority → None</span>
            <span>Metadata update → Squads vault 0</span>
            <span>Governance → 2-of-3 multisig</span>
          </div>
        </section>

        <section className="tm-card" aria-labelledby="readiness-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Fail-closed readiness</p>
              <h2 id="readiness-title">Genesis prerequisites</h2>
            </div>
            <span
              className={`tm-status${configErrors.length === 0 ? " tm-status-ready" : ""}`}
            >
              {configErrors.length === 0 ? "Configured" : "Blocked"}
            </span>
          </div>
          <ul className="tg-checklist">
            <li className="tg-check-ok">
              Devnet Squads multisig and vault 0 are finalized.
            </li>
            <li className="tg-check-ok">
              Supply, allocations, authorities, and campaign hashes are fixed.
            </li>
            <li className="tg-check-ok">
              Tokenomics Core identity {TOKENOMICS_GENESIS_CONFIG.programId} is
              fixed for devnet.
            </li>
            {configErrors.map((configError) => (
              <li className="tg-check-blocked" key={configError}>
                {configError}
              </li>
            ))}
            {configErrors.length === 0 ? (
              <li className="tg-check-pending">
                Prepare will verify the deployed program, multisig, upgrade
                authority, GlobalConfig, unused PDAs, balance, and rent
                on-chain.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="tm-card" aria-labelledby="genesis-wallet-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 1</p>
              <h2 id="genesis-wallet-title">Connect Phantom wallet A</h2>
            </div>
            <span
              className={`tm-status${connectionValid ? " tm-status-ready" : ""}`}
            >
              {connectionValid ? "Verified" : "Required"}
            </span>
          </div>
          {!isReady ? <p className="tm-muted">Detecting Phantom…</p> : null}
          {isReady && !connected ? (
            <button
              className="tm-button"
              disabled={!phantomConnector || connecting}
              onClick={() => {
                if (phantomConnector) {
                  setError(null);
                  void connect(phantomConnector.id).catch((connectError) =>
                    setError(describeError(connectError)),
                  );
                }
              }}
              type="button"
            >
              {connecting ? "Connecting…" : "Connect Phantom"}
            </button>
          ) : null}
          {connected && walletAddress ? (
            <div className="tm-wallet-row">
              <div>
                <span>{walletName}</span>
                <code title={walletAddress}>{walletAddress}</code>
              </div>
              <button
                className="tm-button tm-button-secondary"
                disabled={busy !== null}
                onClick={() => void disconnect()}
                type="button"
              >
                Disconnect
              </button>
            </div>
          ) : null}
          {connected && !isPhantom ? (
            <p className="tm-error">
              Disconnect this wallet and connect Phantom.
            </p>
          ) : null}
          {connected && isPhantom && !isWalletA ? (
            <p className="tm-error">
              Select wallet A in Phantom: {WALLET_A.address}
            </p>
          ) : null}
        </section>

        <section className="tm-card" aria-labelledby="genesis-prepare-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 2</p>
              <h2 id="genesis-prepare-title">Run the read-only preflight</h2>
            </div>
            <span className="tm-status">No signature</span>
          </div>
          <p className="tm-muted">
            Preparation cannot submit a transaction. It derives the one-time
            mint only in browser memory and rejects any program, authority,
            account, cluster, metadata, or balance mismatch.
          </p>
          <button
            className="tm-button"
            disabled={
              !connectionValid ||
              busy !== null ||
              result !== null ||
              configErrors.length > 0
            }
            onClick={() => void prepare()}
            type="button"
          >
            {busy === "preparing" ? "Checking devnet…" : "Prepare JDR genesis"}
          </button>
        </section>

        {summary ? <GenesisReview summary={summary} /> : null}

        {summary && !result ? (
          <section
            className="tm-card tm-submit"
            aria-labelledby="genesis-submit"
          >
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 3</p>
                <h2 id="genesis-submit">Sign, simulate, then initialize</h2>
              </div>
              <span className="tm-status">Phantom approval</span>
            </div>
            <p className="tm-muted">
              Phantom signs first. The exact signed bytes are simulated with
              signature verification and are sent only after a clean result.
              Finalized mint, metadata, allocations, authorities, and custody
              accounts are then read back field by field.
            </p>
            <label className="tm-confirm">
              <input
                checked={accepted}
                disabled={busy !== null}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed Devnet, wallet A, program and upgrade authority,
                metadata URI, one-billion fixed supply, 200M/800M allocation,
                800M lock, Squads governance, costs, and irreversible
                mint/freeze authority revocation.
              </span>
            </label>
            <button
              className="tm-button tm-button-create"
              disabled={!accepted || !connectionValid || busy !== null}
              onClick={() => void submit()}
              type="button"
            >
              {busy === "submitting"
                ? "Waiting for Phantom and devnet…"
                : "Sign in Phantom, simulate, and initialize"}
            </button>
          </section>
        ) : null}

        {result ? (
          <section
            className="tm-card tm-success"
            aria-labelledby="genesis-success"
          >
            <p className="tm-eyebrow">Strict verification passed</p>
            <h2 id="genesis-success">JDR genesis finalized on devnet</h2>
            <p>
              Supply, metadata, authority revocation, 200M campaign allocation,
              800M treasury lock, and Squads-controlled governance all match the
              reviewed configuration.
            </p>
            <div className="tm-success-links">
              <ExplorerLink path={`address/${result.addresses.mint}`}>
                View JDR mint
              </ExplorerLink>
              <ExplorerLink path={`tx/${result.signature}`}>
                View transaction
              </ExplorerLink>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="tm-error tm-error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="tm-footer">
          This is a Devnet rehearsal only. No mainnet token, custody account, or
          launch approval is created by this page.
        </footer>
      </div>
    </main>
  );
}
