"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import {
  type IdealerVrfConfigGovernanceAction,
  type IdealerVrfConfigGovernanceResult,
  type IdealerVrfConfigGovernanceState,
  IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG,
  type PreparedIdealerVrfConfigGovernanceAction,
  prepareIdealerVrfConfigGovernanceAction,
  readIdealerVrfConfigGovernanceState,
  signSimulateSendAndVerifyIdealerVrfGovernanceAction,
  vrfGovernanceActionAvailability,
} from "../../solana/idealerVrfConfigGovernance";
import { IDEALER_VRF_CONFIG_PROPOSAL_CONFIG } from "../../solana/idealerVrfConfigProposalConfig";
import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import "../tokenomics-multisig/tokenomics-multisig.css";
import "../tokenomics-upgrade/tokenomics-upgrade.css";
import "../tokenomics-upgrade-governance/tokenomics-upgrade-governance.css";

function shortAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    if (/reject|declin|cancel/i.test(error.message)) {
      return "The wallet request was rejected. Nothing was submitted.";
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

function memberLabel(memberAddress: string) {
  return (
    SQUADS_DEVNET_CONFIG.members.find(
      (member) => member.address === memberAddress,
    )?.label ?? shortAddress(memberAddress)
  );
}

export function IdealerVrfConfigGovernanceApp() {
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
  const preparedRef =
    useRef<PreparedIdealerVrfConfigGovernanceAction | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? "";
  const walletName = wallet?.connector.name ?? "";
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<
    "reading" | "preparing" | "submitting" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [preparedAction, setPreparedAction] =
    useState<IdealerVrfConfigGovernanceAction | null>(null);
  const [result, setResult] =
    useState<IdealerVrfConfigGovernanceResult | null>(null);
  const [state, setState] =
    useState<IdealerVrfConfigGovernanceState | null>(null);
  const member = useMemo(
    () =>
      SQUADS_DEVNET_CONFIG.members.find(
        (candidate) => candidate.address === walletAddress,
      ),
    [walletAddress],
  );
  const availability =
    state && member
      ? vrfGovernanceActionAvailability({
          approved: state.approved,
          memberAddress: member.address,
          status: state.status,
        })
      : { canApprove: false, canExecute: false };

  useEffect(() => {
    preparedRef.current = null;
    setAccepted(false);
    setPreparedAction(null);
    setResult(null);
    setError(null);
  }, [walletAddress]);

  async function refresh() {
    setBusy("reading");
    setError(null);
    try {
      setState(
        await readIdealerVrfConfigGovernanceState(
          cluster.endpoint.toString(),
        ),
      );
    } catch (readError) {
      setState(null);
      setError(describeError(readError));
    } finally {
      setBusy(null);
    }
  }

  async function prepare(action: IdealerVrfConfigGovernanceAction) {
    if (!member) {
      return;
    }
    setBusy("preparing");
    setError(null);
    setResult(null);
    try {
      const prepared = await prepareIdealerVrfConfigGovernanceAction({
        action,
        memberAddress: member.address,
        rpcEndpoint: cluster.endpoint.toString(),
      });
      preparedRef.current = prepared;
      setState(prepared.stateBefore);
      setPreparedAction(action);
      setAccepted(false);
    } catch (prepareError) {
      preparedRef.current = null;
      setPreparedAction(null);
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
      const submitted =
        await signSimulateSendAndVerifyIdealerVrfGovernanceAction({
          client,
          prepared,
          wallet,
        });
      preparedRef.current = null;
      setPreparedAction(null);
      setAccepted(false);
      setState(submitted.state);
      setResult(submitted);
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
          <p className="tm-eyebrow">Squads governance - M10</p>
          <h1>Approve and activate canonical ORAO</h1>
          <p className="tm-lead">
            {state?.status === "Executed"
              ? "The proposal is executed and both Idealer VRF provider fields match the canonical ORAO Network State."
              : `Two different devnet members approve proposal ${IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionIndex.toString()}. After the 2-of-3 threshold, one authorized member executes the exact stored provider configuration.`}
          </p>
        </header>

        <section className="tm-card" aria-labelledby="state-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 1</p>
              <h2 id="state-title">Read the finalized proposal</h2>
            </div>
            <span className={`tm-status${state ? " tm-status-ready" : ""}`}>
              {state?.status ?? "Not loaded"}
            </span>
          </div>
          <p className="tm-muted">
            This verifies the deployed ORAO-capable artifact, exact stored
            instruction, official ORAO accounts, idle GlobalConfig, current
            providers, votes, and Squads identities before enabling any action.
          </p>
          <button
            className="tm-button"
            disabled={busy !== null}
            onClick={() => void refresh()}
            type="button"
          >
            {busy === "reading" ? "Verifying devnet..." : "Refresh strict state"}
          </button>

          {state ? (
            <>
              <dl className="tm-details tug-details">
                <div>
                  <dt>Proposal status</dt>
                  <dd>{state.status}</dd>
                </div>
                <div>
                  <dt>Approvals</dt>
                  <dd>{state.approved.length} of 2 required</dd>
                </div>
                <div>
                  <dt>Draw provider</dt>
                  <dd title={state.drawProvider}>
                    {shortAddress(state.drawProvider)}
                  </dd>
                </div>
                <div>
                  <dt>Election provider</dt>
                  <dd title={state.electionProvider}>
                    {shortAddress(state.electionProvider)}
                  </dd>
                </div>
                <div>
                  <dt>Next turn</dt>
                  <dd>{state.nextTurnId}</dd>
                </div>
                <div>
                  <dt>Configuration</dt>
                  <dd>
                    {state.configurationComplete
                      ? "Canonical ORAO active"
                      : "Switchboard unchanged"}
                  </dd>
                </div>
              </dl>
              <div className="tug-votes">
                {SQUADS_DEVNET_CONFIG.members.map((candidate) => (
                  <div className="tug-vote" key={candidate.address}>
                    <span>{candidate.label}</span>
                    <code title={candidate.address}>
                      {shortAddress(candidate.address)}
                    </code>
                    <strong
                      className={
                        state.approved.includes(candidate.address)
                          ? "tug-approved"
                          : ""
                      }
                    >
                      {state.approved.includes(candidate.address)
                        ? "Approved"
                        : state.status === "Executed"
                          ? "Not required"
                          : "Pending"}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="tm-success-links tug-links">
                <ExplorerLink path={`address/${state.proposalAddress}`}>
                  View proposal
                </ExplorerLink>
                <ExplorerLink path={`address/${state.transactionAddress}`}>
                  View vault transaction
                </ExplorerLink>
              </div>
            </>
          ) : null}
        </section>

        {state?.status !== "Executed" ? (
          <section className="tm-card" aria-labelledby="wallet-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 2</p>
                <h2 id="wallet-title">Connect one multisig member</h2>
              </div>
              <span
                className={`tm-status${member ? " tm-status-ready" : ""}`}
              >
                {member ? member.label : "Required"}
              </span>
            </div>
            {!isReady ? <p className="tm-muted">Detecting wallets...</p> : null}
            {isReady && !connected ? (
              <div className="tug-connectors">
                {connectors.length > 0 ? (
                  connectors.map((connector) => (
                    <button
                      className="tm-button tm-button-secondary"
                      disabled={connecting}
                      key={connector.id}
                      onClick={() =>
                        void connect(connector.id).catch((connectError) =>
                          setError(describeError(connectError)),
                        )
                      }
                      type="button"
                    >
                      {connecting
                        ? "Connecting..."
                        : `Connect ${connector.name}`}
                    </button>
                  ))
                ) : (
                  <p className="tm-error">
                    No Wallet Standard wallet was detected.
                  </p>
                )}
              </div>
            ) : null}
            {connected && walletAddress ? (
              <div className="tm-wallet-row">
                <div>
                  <span>
                    {member?.label ?? "Unknown account"} via {walletName}
                  </span>
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
            {connected && !member ? (
              <p className="tm-error">
                Select wallet A, B, or C. This account is not a devnet
                multisig member.
              </p>
            ) : null}
          </section>
        ) : null}

        {state?.status !== "Executed" ? (
          <section className="tm-card" aria-labelledby="action-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 3</p>
                <h2 id="action-title">Prepare one governance action</h2>
              </div>
              <span className="tm-status">
                {state?.status === "Approved" ? "Execution" : "Approval"}
              </span>
            </div>
            <p className="tm-muted">
              Approval records one vote only. Execution changes both VRF
              provider fields atomically to the reviewed canonical ORAO Network
              State; it does not open a turn or request randomness.
            </p>
            <div className="tug-actions">
              <button
                className="tm-button"
                disabled={!availability.canApprove || busy !== null}
                onClick={() => void prepare("approve")}
                type="button"
              >
                {busy === "preparing"
                  ? "Verifying action..."
                  : `Prepare approval${member ? ` as ${member.label}` : ""}`}
              </button>
              <button
                className="tm-button tug-execute"
                disabled={!availability.canExecute || busy !== null}
                onClick={() => void prepare("execute")}
                type="button"
              >
                Prepare ORAO activation
              </button>
            </div>
            {state?.status === "Active" && state.approved.length === 1 ? (
              <p className="tm-note">
                One approval is finalized. Disconnect and select a different
                member account for the second approval.
              </p>
            ) : null}
          </section>
        ) : null}

        {preparedAction ? (
          <section className="tm-card tm-submit" aria-labelledby="sign-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Required review</p>
                <h2 id="sign-title">
                  Sign {preparedAction === "approve" ? "approval" : "execution"}
                </h2>
              </div>
              <span className="tm-status">Wallet approval</span>
            </div>
            <label className="tm-confirm">
              <input
                checked={accepted}
                disabled={busy !== null}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed Solana devnet, Squads proposal{" "}
                {IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionIndex.toString()},
                the exact stored Idealer instruction, current votes, connected
                member, idle GlobalConfig, and canonical ORAO Network State{" "}
                {shortAddress(
                  IDEALER_VRF_CONFIG_PROPOSAL_CONFIG.targetProviderAddress,
                )}
                .
                {preparedAction === "execute"
                  ? " I also reviewed that execution changes both provider fields and performs no ORAO request, turn opening, or JDR transfer."
                  : ""}
              </span>
            </label>
            <button
              className="tm-button tm-button-create"
              disabled={!accepted || busy !== null}
              onClick={() => void submit()}
              type="button"
            >
              {busy === "submitting"
                ? "Simulating and awaiting finalization..."
                : `Sign and submit ${preparedAction}`}
            </button>
          </section>
        ) : null}

        {result ? (
          <section className="tm-card tm-success" aria-labelledby="result-title">
            <p className="tm-eyebrow">Strict verification passed</p>
            <h2 id="result-title">
              {result.action === "execute"
                ? "Canonical ORAO activated"
                : "Approval finalized"}
            </h2>
            <p>
              {result.action === "execute"
                ? "The proposal is Executed and both finalized GlobalConfig provider fields match canonical ORAO."
                : `${memberLabel(walletAddress)} is recorded on-chain. The proposal now has ${result.state.approved.length} approval(s).`}
            </p>
            <div className="tm-success-links">
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
          This ceremony and all three member addresses are devnet-only.
          Mainnet requires separate audited program, metadata, multisig,
          provider, and governance decisions.
        </footer>
      </div>
    </main>
  );
}
