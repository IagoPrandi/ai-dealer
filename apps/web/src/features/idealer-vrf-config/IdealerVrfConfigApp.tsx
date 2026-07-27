"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import {
  type IdealerVrfConfigProposalResult,
  type IdealerVrfConfigProposalSummary,
  type PreparedIdealerVrfConfigProposal,
  prepareIdealerVrfConfigProposal,
  signSimulateSendAndVerifyIdealerVrfConfigProposal,
} from "../../solana/idealerVrfConfigProposal";
import { validateIdealerVrfConfigProposalConfig } from "../../solana/idealerVrfConfigProposalConfig";
import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import "../tokenomics-multisig/tokenomics-multisig.css";
import "../tokenomics-upgrade/tokenomics-upgrade.css";

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

function VrfConfigReview({
  summary,
}: {
  summary: IdealerVrfConfigProposalSummary;
}) {
  return (
    <section className="tm-card tm-review" aria-labelledby="vrf-review">
      <div className="tm-section-heading">
        <div>
          <p className="tm-eyebrow">Required review</p>
          <h2 id="vrf-review">Governed ORAO activation proposal</h2>
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
          <dt>GlobalConfig</dt>
          <dd title={summary.globalConfigAddress}>
            {shortAddress(summary.globalConfigAddress)}
          </dd>
        </div>
        <div>
          <dt>ProgramData governance</dt>
          <dd title={summary.vaultAddress}>
            Vault 0 - {shortAddress(summary.vaultAddress)}
          </dd>
        </div>
        <div>
          <dt>Current draw provider</dt>
          <dd title={summary.currentDrawProvider}>
            Switchboard - {shortAddress(summary.currentDrawProvider)}
          </dd>
        </div>
        <div>
          <dt>Current election provider</dt>
          <dd title={summary.currentElectionProvider}>
            Switchboard - {shortAddress(summary.currentElectionProvider)}
          </dd>
        </div>
        <div>
          <dt>Target draw provider</dt>
          <dd title={summary.targetDrawProvider}>
            ORAO - {shortAddress(summary.targetDrawProvider)}
          </dd>
        </div>
        <div>
          <dt>Target election provider</dt>
          <dd title={summary.targetElectionProvider}>
            ORAO - {shortAddress(summary.targetElectionProvider)}
          </dd>
        </div>
        <div>
          <dt>Active turn</dt>
          <dd>None - next turn is {summary.nextTurnId}</dd>
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
          <dd>Zero approvals - configuration is unchanged</dd>
        </div>
      </dl>

      <div className="tu-hash">
        <span>Canonical ORAO Network State</span>
        <code>{summary.targetDrawProvider}</code>
      </div>
      <p className="tm-note">
        The submitted transaction creates one Squads vault transaction and one
        active proposal containing exactly one Idealer set_vrf_config
        instruction. It records no approval and does not change either provider,
        open a turn, request randomness, move SOL, or transfer JDR.
      </p>
      <p className="tm-error">
        Approve only if both target fields equal the canonical ORAO Network
        State and the governance signer is Squads vault 0.
      </p>
    </section>
  );
}

export function IdealerVrfConfigApp() {
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
  const preparedRef = useRef<PreparedIdealerVrfConfigProposal | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? null;
  const walletName = wallet?.connector.name ?? null;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "submitting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] =
    useState<IdealerVrfConfigProposalResult | null>(null);
  const [summary, setSummary] =
    useState<IdealerVrfConfigProposalSummary | null>(null);
  const configErrors = useMemo(
    () => validateIdealerVrfConfigProposalConfig(),
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
      const prepared = await prepareIdealerVrfConfigProposal({
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
      const created =
        await signSimulateSendAndVerifyIdealerVrfConfigProposal({
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
          <p className="tm-eyebrow">Randomness governance - M10</p>
          <h1>Propose canonical ORAO activation</h1>
          <p className="tm-lead">
            Wallet A creates a zero-approval Squads proposal to change both
            Idealer VRF provider fields from Switchboard to the official ORAO
            Network State. Two different members must approve before a separate
            execution.
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
            This verifies the deployed artifact, ProgramData authority, idle
            GlobalConfig, current Switchboard fields, official ORAO program and
            Network State, exact 2-of-3 multisig, and next unused proposal.
          </p>
          <button
            className="tm-button"
            disabled={!connectionValid || busy !== null || result !== null}
            onClick={() => void prepare()}
            type="button"
          >
            {busy === "preparing"
              ? "Verifying devnet state..."
              : "Prepare ORAO activation proposal"}
          </button>
        </section>

        {summary ? <VrfConfigReview summary={summary} /> : null}

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
              bytes are simulated and sent only if simulation succeeds.
            </p>
            <label className="tm-confirm">
              <input
                checked={accepted}
                disabled={busy !== null}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed devnet, the idle GlobalConfig, current Switchboard
                fields, canonical ORAO program and Network State, ProgramData
                governance, proposal identity, and zero-vote state.
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
            <h2 id="success-title">ORAO activation proposal created</h2>
            <p>
              The finalized Squads proposal is active with zero approvals. Both
              VRF fields still point to Switchboard until separate execution.
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
          This program, multisig, vault, members, and ORAO transition are
          devnet-only. Mainnet requires a separate audited identity and
          governance ceremony.
        </footer>
      </div>
    </main>
  );
}
