"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import {
  type PreparedSquadsCreation,
  type SquadsCreationResult,
  type SquadsCreationSummary,
  prepareSquadsCreation,
  signSimulateSendAndVerify,
} from "../../solana/squadsProvisioning";
import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import "./tokenomics-multisig.css";

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

function ReviewDetails({ summary }: { summary: SquadsCreationSummary }) {
  return (
    <section className="tm-card tm-review" aria-labelledby="transaction-review">
      <div className="tm-section-heading">
        <div>
          <p className="tm-eyebrow">Required review</p>
          <h2 id="transaction-review">Creation transaction</h2>
        </div>
        <span className="tm-status tm-status-ready">Prepared</span>
      </div>

      <dl className="tm-details">
        <div>
          <dt>Cluster</dt>
          <dd>Solana devnet</dd>
        </div>
        <div>
          <dt>Fee payer and creator</dt>
          <dd>Wallet A · {shortAddress(WALLET_A.address)}</dd>
        </div>
        <div>
          <dt>Program fee recipient</dt>
          <dd title={summary.programTreasury}>
            {shortAddress(summary.programTreasury)}
          </dd>
        </div>
        <div>
          <dt>Program creation fee</dt>
          <dd>{formatSol(summary.creationFeeLamports)}</dd>
        </div>
        <div>
          <dt>Estimated account rent</dt>
          <dd>{formatSol(summary.estimatedRentLamports)}</dd>
        </div>
        <div>
          <dt>Token movement</dt>
          <dd>None · no JDR is minted or transferred here</dd>
        </div>
        <div>
          <dt>Multisig account</dt>
          <dd title={summary.multisigAddress}>
            <ExplorerLink path={`address/${summary.multisigAddress}`}>
              {shortAddress(summary.multisigAddress)}
            </ExplorerLink>
          </dd>
        </div>
        <div>
          <dt>Derived vault 0</dt>
          <dd title={summary.vaultAddress}>
            <ExplorerLink path={`address/${summary.vaultAddress}`}>
              {shortAddress(summary.vaultAddress)}
            </ExplorerLink>
          </dd>
        </div>
      </dl>

      <p className="tm-note">
        Phantom will also show the network fee. The one-time create key exists
        only in this browser tab and is never stored or logged.
      </p>
    </section>
  );
}

export function TokenomicsMultisigApp() {
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
  const preparedRef = useRef<PreparedSquadsCreation | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? null;
  const walletName = wallet?.connector.name ?? null;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"creating" | "preparing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SquadsCreationResult | null>(null);
  const [summary, setSummary] = useState<SquadsCreationSummary | null>(null);

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
    if (!walletAddress || !connectionValid) {
      return;
    }
    setBusy("preparing");
    setError(null);
    setResult(null);
    try {
      const prepared = await prepareSquadsCreation({
        creatorAddress: walletAddress,
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

  async function create() {
    const prepared = preparedRef.current;
    if (!wallet || !prepared || !accepted) {
      return;
    }
    setBusy("creating");
    setError(null);
    try {
      const created = await signSimulateSendAndVerify({
        client,
        prepared,
        wallet,
      });
      preparedRef.current = null;
      setResult(created);
      setSummary(created);
      setAccepted(false);
    } catch (createError) {
      setError(describeError(createError));
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
          <p className="tm-eyebrow">Tokenomics custody · M10</p>
          <h1>Create the 2-of-3 governance multisig</h1>
          <p className="tm-lead">
            Wallet A creates a Squads Protocol v4 account. Wallets A, B, and C
            can initiate, vote, and execute; any two approvals are required and
            execution is immediate.
          </p>
        </header>

        <section className="tm-card" aria-labelledby="configuration-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Immutable review</p>
              <h2 id="configuration-title">Devnet configuration</h2>
            </div>
            <span className="tm-status">2 of 3</span>
          </div>

          <div className="tm-members">
            {SQUADS_DEVNET_CONFIG.members.map((member, index) => (
              <article className="tm-member" key={member.address}>
                <span className="tm-member-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <div>
                  <strong>{member.label}</strong>
                  <code title={member.address}>{member.address}</code>
                </div>
                <span className="tm-permission">All permissions</span>
              </article>
            ))}
          </div>

          <div className="tm-facts">
            <span>Squads v4</span>
            <span>Threshold 2</span>
            <span>Time lock 0s</span>
            <span>Vault index 0</span>
          </div>
        </section>

        <section className="tm-card" aria-labelledby="wallet-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 1</p>
              <h2 id="wallet-title">Connect Phantom wallet A</h2>
            </div>
            <span
              className={`tm-status${connectionValid ? " tm-status-ready" : ""}`}
            >
              {connectionValid ? "Verified" : "Required"}
            </span>
          </div>

          {!isReady ? <p className="tm-muted">Detecting Phantom…</p> : null}
          {isReady && !connected ? (
            <>
              <p className="tm-muted">
                The connected address must exactly match wallet A above.
              </p>
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
              {!phantomConnector ? (
                <p className="tm-error">
                  Phantom was not detected in this browser.
                </p>
              ) : null}
            </>
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
              Disconnect this wallet and connect Phantom. Other providers are
              blocked for this ceremony.
            </p>
          ) : null}
          {connected && isPhantom && !isWalletA ? (
            <p className="tm-error">
              Wrong Phantom account. Select wallet A in Phantom:{" "}
              {WALLET_A.address}
            </p>
          ) : null}
        </section>

        <section className="tm-card" aria-labelledby="prepare-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 2</p>
              <h2 id="prepare-title">Prepare the account</h2>
            </div>
            <span className="tm-status">Read only</span>
          </div>
          <p className="tm-muted">
            This checks the RPC genesis hash, reads the Squads devnet fee, and
            derives the multisig and vault addresses. It cannot submit a
            transaction.
          </p>
          <button
            className="tm-button"
            disabled={!connectionValid || busy !== null || result !== null}
            onClick={() => void prepare()}
            type="button"
          >
            {busy === "preparing" ? "Checking devnet…" : "Prepare creation"}
          </button>
        </section>

        {summary ? <ReviewDetails summary={summary} /> : null}

        {summary && !result ? (
          <section className="tm-card tm-submit" aria-labelledby="submit-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 3</p>
                <h2 id="submit-title">Sign, simulate, then create</h2>
              </div>
              <span className="tm-status">Phantom approval</span>
            </div>
            <p className="tm-muted">
              Phantom signs first. The signed bytes are simulated with signature
              verification. They are sent only if simulation succeeds, then the
              finalized account is read back and checked field by field.
            </p>
            <label className="tm-confirm">
              <input
                checked={accepted}
                disabled={busy !== null}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed the devnet cluster, wallet A, fee recipient, costs,
                members, threshold, permissions, and immediate execution.
              </span>
            </label>
            <button
              className="tm-button tm-button-create"
              disabled={!accepted || !connectionValid || busy !== null}
              onClick={() => void create()}
              type="button"
            >
              {busy === "creating"
                ? "Waiting for Phantom and devnet…"
                : "Sign in Phantom, simulate, and create"}
            </button>
          </section>
        ) : null}

        {result ? (
          <section
            className="tm-card tm-success"
            aria-labelledby="success-title"
          >
            <p className="tm-eyebrow">Strict verification passed</p>
            <h2 id="success-title">Multisig created on devnet</h2>
            <p>
              The account owner, three members, permission masks, 2-of-3
              threshold, zero time lock, null config authority, and null rent
              collector all match the PRD.
            </p>
            <div className="tm-success-links">
              <ExplorerLink path={`address/${result.multisigAddress}`}>
                View multisig
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
          These three member addresses and every account created by this page
          are for devnet rehearsal only. Mainnet requires a separate ceremony
          and separate addresses.
        </footer>
      </div>
    </main>
  );
}
