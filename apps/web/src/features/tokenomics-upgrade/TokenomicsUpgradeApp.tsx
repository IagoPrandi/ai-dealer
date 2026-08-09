"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import {
  type PreparedTokenomicsUpgradeProposal,
  type TokenomicsUpgradeProposalResult,
  type TokenomicsUpgradeProposalSummary,
  prepareTokenomicsUpgradeProposal,
  signSimulateSendAndVerifyUpgradeProposal,
} from "../../solana/tokenomicsUpgradeProposal";
import { validateTokenomicsUpgradeProposalConfig } from "../../solana/tokenomicsUpgradeProposalConfig";
import "../tokenomics-multisig/tokenomics-multisig.css";
import "./tokenomics-upgrade.css";

const WALLET_A = SQUADS_DEVNET_CONFIG.members[0]!;

function shortAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
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

function UpgradeReview({
  summary,
}: {
  summary: TokenomicsUpgradeProposalSummary;
}) {
  return (
    <section className="tm-card tm-review" aria-labelledby="upgrade-review">
      <div className="tm-section-heading">
        <div>
          <p className="tm-eyebrow">Required review</p>
          <h2 id="upgrade-review">Governed Tyche upgrade proposal</h2>
        </div>
        <span className="tm-status tm-status-ready">Prepared</span>
      </div>

      <dl className="tm-details tu-details">
        <div>
          <dt>Cluster</dt>
          <dd>Solana devnet</dd>
        </div>
        <div>
          <dt>Creator and fee payer</dt>
          <dd>Wallet A - {shortAddress(WALLET_A.address)}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd title={summary.programId}>{shortAddress(summary.programId)}</dd>
        </div>
        <div>
          <dt>ProgramData</dt>
          <dd title={summary.programDataAddress}>
            {shortAddress(summary.programDataAddress)}
          </dd>
        </div>
        <div>
          <dt>Reviewed buffer</dt>
          <dd title={summary.bufferAddress}>
            {shortAddress(summary.bufferAddress)}
          </dd>
        </div>
        <div>
          <dt>Artifact length</dt>
          <dd>{summary.bufferProgramLength.toLocaleString("en-US")} bytes</dd>
        </div>
        <div>
          <dt>Buffer authority and spill</dt>
          <dd title={summary.vaultAddress}>
            Squads vault 0 - {shortAddress(summary.vaultAddress)}
          </dd>
        </div>
        <div>
          <dt>Squads transaction index</dt>
          <dd>{summary.transactionIndex.toString()}</dd>
        </div>
        <div>
          <dt>Proposal account</dt>
          <dd title={summary.proposalAddress}>
            {shortAddress(summary.proposalAddress)}
          </dd>
        </div>
        <div>
          <dt>Votes and execution</dt>
          <dd>Zero approvals - program code is unchanged</dd>
        </div>
      </dl>

      <div className="tu-hash">
        <span>Verified on-chain buffer SHA-256</span>
        <code>{summary.bufferSha256}</code>
      </div>
      <p className="tm-note">
        The submitted transaction creates one Squads vault transaction and one
        active proposal containing exactly one Upgradeable Loader upgrade
        instruction. It records no approval and does not execute the upgrade,
        migrate campaign state, mint tokens, or transfer JDR.
      </p>
      <p className="tm-error">
        Approve only after the buffer address, byte length, SHA-256, program,
        ProgramData, vault authority, and vault spill recipient match this
        review.
      </p>
    </section>
  );
}

export function TokenomicsUpgradeApp() {
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
  const preparedRef = useRef<PreparedTokenomicsUpgradeProposal | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? null;
  const walletName = wallet?.connector.name ?? null;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "submitting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TokenomicsUpgradeProposalResult | null>(
    null,
  );
  const [summary, setSummary] =
    useState<TokenomicsUpgradeProposalSummary | null>(null);
  const configErrors = useMemo(
    () => validateTokenomicsUpgradeProposalConfig(),
    [],
  );
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
      const prepared = await prepareTokenomicsUpgradeProposal({
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

  async function submit() {
    const prepared = preparedRef.current;
    if (!wallet || !prepared || !accepted) {
      return;
    }
    setBusy("submitting");
    setError(null);
    try {
      const created = await signSimulateSendAndVerifyUpgradeProposal({
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
          <p className="tm-eyebrow">Program governance - M10</p>
          <h1>Propose the reviewed Tyche upgrade</h1>
          <p className="tm-lead">
            Wallet A creates a zero-approval Squads proposal to install the
            reviewed revenue-fee and epoch-bridge artifact. Proposal creation
            does not upgrade the program; two different devnet members must
            approve before a separate execution.
          </p>
        </header>

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
          {!isReady ? <p className="tm-muted">Detecting Phantom...</p> : null}
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
              {connecting ? "Connecting..." : "Connect Phantom"}
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
          {connected && (!isPhantom || !isWalletA) ? (
            <p className="tm-error">
              Select wallet A in Phantom: {WALLET_A.address}
            </p>
          ) : null}
        </section>

        <section className="tm-card" aria-labelledby="prepare-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 2</p>
              <h2 id="prepare-title">Verify and prepare</h2>
            </div>
            <span className="tm-status">Read only</span>
          </div>
          <p className="tm-muted">
            This re-hashes the deployed program and complete on-chain buffer,
            verifies the ProgramData capacity and zero padding, checks both
            loader authorities and the 2-of-3 multisig, then derives the next
            unused Squads proposal address.
          </p>
          <button
            className="tm-button"
            disabled={!connectionValid || busy !== null || result !== null}
            onClick={() => void prepare()}
            type="button"
          >
            {busy === "preparing"
              ? "Hashing program and buffer..."
              : "Prepare governed upgrade proposal"}
          </button>
        </section>

        {summary ? <UpgradeReview summary={summary} /> : null}

        {summary && !result ? (
          <section className="tm-card tm-submit" aria-labelledby="submit-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 3</p>
                <h2 id="submit-title">Sign, simulate, and create</h2>
              </div>
              <span className="tm-status">Phantom approval</span>
            </div>
            <p className="tm-muted">
              Phantom signs the proposal-creation transaction first. The exact
              signed bytes are simulated and sent only if simulation succeeds.
            </p>
            <label className="tm-confirm">
              <input
                checked={accepted}
                disabled={busy !== null}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed the devnet cluster, program, ProgramData, complete
                buffer address, artifact byte length and SHA-256, Squads vault
                authority and spill recipient, next proposal identity, and
                zero-vote state.
              </span>
            </label>
            <button
              className="tm-button tm-button-create"
              disabled={!accepted || !connectionValid || busy !== null}
              onClick={() => void submit()}
              type="button"
            >
              {busy === "submitting"
                ? "Waiting for Phantom and devnet..."
                : "Create proposal with zero approvals"}
            </button>
          </section>
        ) : null}

        {result ? (
          <section
            className="tm-card tm-success"
            aria-labelledby="success-title"
          >
            <p className="tm-eyebrow">Strict verification passed</p>
            <h2 id="success-title">Upgrade proposal created</h2>
            <p>
              The finalized Squads proposal is active with zero approvals. The
              Tyche program code has not been upgraded.
            </p>
            <div className="tm-success-links">
              <ExplorerLink path={`address/${result.proposalAddress}`}>
                View proposal account
              </ExplorerLink>
              <ExplorerLink path={`tx/${result.signature}`}>
                View creation transaction
              </ExplorerLink>
            </div>
          </section>
        ) : null}

        {configErrors.length > 0 ? (
          <div className="tm-error tm-error-banner" role="alert">
            {configErrors.join(" ")}
          </div>
        ) : null}
        {error ? (
          <div className="tm-error tm-error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="tm-footer">
          This program, multisig, vault, and all three member addresses are
          devnet-only. Mainnet requires a separate audited artifact, program
          identity, metadata decision, and governance ceremony.
        </footer>
      </div>
    </main>
  );
}
