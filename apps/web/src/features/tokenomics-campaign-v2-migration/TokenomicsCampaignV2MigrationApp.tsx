"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useClusterState,
  useSolanaClient,
  useWalletConnection,
} from "@solana/react-hooks";

import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import {
  type CampaignV2MigrationAction,
  type CampaignV2MigrationResult,
  type CampaignV2MigrationState,
  type PreparedCampaignV2MigrationAction,
  TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG,
  campaignV2MigrationActionAvailability,
  prepareCampaignV2MigrationAction,
  readCampaignV2MigrationState,
  signSimulateSendAndVerifyCampaignV2MigrationAction,
} from "../../solana/tokenomicsCampaignV2Migration";
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

export function TokenomicsCampaignV2MigrationApp() {
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
  const preparedRef = useRef<PreparedCampaignV2MigrationAction | null>(null);
  const walletAddress = wallet?.account.address.toString() ?? "";
  const member = SQUADS_DEVNET_CONFIG.members.find(
    (candidate) => candidate.address === walletAddress,
  );
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<
    "reading" | "preparing" | "submitting" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [preparedAction, setPreparedAction] =
    useState<CampaignV2MigrationAction | null>(null);
  const [result, setResult] = useState<CampaignV2MigrationResult | null>(null);
  const [state, setState] = useState<CampaignV2MigrationState | null>(null);
  const availability =
    state && member
      ? campaignV2MigrationActionAvailability({
          approved: state.approved,
          memberAddress: member.address,
          status: state.status,
        })
      : { canApprove: false, canCreate: false, canExecute: false };
  const currentAction = useMemo<CampaignV2MigrationAction | null>(() => {
    if (availability.canCreate) return "create";
    if (availability.canApprove) return "approve";
    if (availability.canExecute) return "execute";
    return null;
  }, [
    availability.canApprove,
    availability.canCreate,
    availability.canExecute,
  ]);

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
      setState(await readCampaignV2MigrationState(cluster.endpoint.toString()));
    } catch (readError) {
      setState(null);
      setError(describeError(readError));
    } finally {
      setBusy(null);
    }
  }

  async function prepare(action: CampaignV2MigrationAction) {
    if (!member) return;
    setBusy("preparing");
    setError(null);
    try {
      const prepared = await prepareCampaignV2MigrationAction({
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
    if (!wallet || !prepared || !accepted) return;
    setBusy("submitting");
    setError(null);
    try {
      const submitted =
        await signSimulateSendAndVerifyCampaignV2MigrationAction({
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
          <p className="tm-eyebrow">Campaign governance</p>
          <h1>Activate the reviewed JDR reward economics</h1>
          <p className="tm-lead">
            Proposal 10 changes only campaign 0&apos;s economic configuration
            hash from v1 to v2. It does not move JDR, change balances, create a
            campaign, or alter the fixed supply.
          </p>
        </header>

        <section className="tm-card" aria-labelledby="state-title">
          <div className="tm-section-heading">
            <div>
              <p className="tm-eyebrow">Step 1</p>
              <h2 id="state-title">Verify strict migration state</h2>
            </div>
            <span className="tm-status">Read only</span>
          </div>
          <button
            className="tm-button"
            disabled={busy !== null}
            onClick={() => void refresh()}
            type="button"
          >
            {busy === "reading"
              ? "Verifying devnet..."
              : "Refresh strict state"}
          </button>
          {state ? (
            <dl className="tm-details tu-details">
              <div>
                <dt>Proposal status</dt>
                <dd>{state.status}</dd>
              </div>
              <div>
                <dt>Approvals</dt>
                <dd>{state.approved.length} of 2 required</dd>
              </div>
              <div>
                <dt>Campaign</dt>
                <dd
                  title={
                    TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.campaignAddress
                  }
                >
                  {shortAddress(
                    TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.campaignAddress,
                  )}
                </dd>
              </div>
              <div>
                <dt>Remaining JDR atoms</dt>
                <dd>{state.remainingAtoms.toString()}</dd>
              </div>
              <div>
                <dt>Vault JDR atoms</dt>
                <dd>{state.vaultAmountAtoms.toString()}</dd>
              </div>
              <div>
                <dt>Economic hash</dt>
                <dd title={state.economicConfigHash}>
                  {shortAddress(state.economicConfigHash)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        {state?.status !== "Executed" ? (
          <section className="tm-card" aria-labelledby="wallet-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 2</p>
                <h2 id="wallet-title">Connect one multisig member</h2>
              </div>
              <span className={`tm-status${member ? " tm-status-ready" : ""}`}>
                {member ? member.label : "Required"}
              </span>
            </div>
            {!isReady ? <p className="tm-muted">Detecting wallets...</p> : null}
            {isReady && !connected ? (
              <div className="tug-connectors">
                {connectors.map((connector) => (
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
                    {connecting ? "Connecting..." : `Connect ${connector.name}`}
                  </button>
                ))}
              </div>
            ) : null}
            {connected ? (
              <div className="tm-wallet-row">
                <div>
                  <span>{member ? member.label : "Unknown account"}</span>
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
                The connected account is not Wallet A, B, or C.
              </p>
            ) : null}
          </section>
        ) : null}

        {state?.status !== "Executed" ? (
          <section className="tm-card" aria-labelledby="action-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Step 3</p>
                <h2 id="action-title">Prepare one governed action</h2>
              </div>
              <span className="tm-status">No token movement</span>
            </div>
            <p className="tm-muted">
              Wallet A creates the zero-vote proposal. Two different members
              approve it, and one authorized member executes only after the
              threshold is finalized.
            </p>
            <button
              className="tm-button"
              disabled={!currentAction || busy !== null}
              onClick={() => currentAction && void prepare(currentAction)}
              type="button"
            >
              {busy === "preparing"
                ? "Verifying action..."
                : currentAction
                  ? `Prepare ${currentAction}${member ? ` as ${member.label}` : ""}`
                  : "Connect an eligible member"}
            </button>
          </section>
        ) : null}

        {preparedAction ? (
          <section className="tm-card tm-submit" aria-labelledby="sign-title">
            <div className="tm-section-heading">
              <div>
                <p className="tm-eyebrow">Required review</p>
                <h2 id="sign-title">Sign {preparedAction}</h2>
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
                I reviewed devnet proposal 10, the exact campaign migration
                discriminator and accounts, the v1 and v2 hashes, campaign and
                vault balances, current votes, and connected member
                {member ? ` ${member.label}` : ""}. No JDR moves.
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
          <section
            className="tm-card tm-success"
            aria-labelledby="result-title"
          >
            <p className="tm-eyebrow">Strict verification passed</p>
            <h2 id="result-title">
              {result.action === "execute"
                ? "JDR reward economics activated"
                : result.action === "create"
                  ? "Migration proposal created"
                  : "Migration approval finalized"}
            </h2>
            <p>
              {result.state.status === "Executed"
                ? "Campaign 0 now carries the reviewed v2 economics hash, with every balance unchanged."
                : `Proposal 10 is ${result.state.status} with ${result.state.approved.length} approval(s).`}
            </p>
            <ExplorerLink path={`tx/${result.signature}`}>
              View transaction
            </ExplorerLink>
          </section>
        ) : null}

        {state?.status === "Executed" ? (
          <section className="tm-card tm-success">
            <p className="tm-eyebrow">Activation complete</p>
            <h2>Campaign 0 uses reward economics v2</h2>
            <p>
              The economic hash is v2 and the campaign allocation, distributed
              amount, remaining amount, and token vault balance match the
              reviewed pre-migration values.
            </p>
          </section>
        ) : null}

        {error ? (
          <div className="tm-error tm-error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="tm-footer">
          This migration and its three member identities are devnet-only.
          Mainnet requires a separate audited release and governance ceremony.
        </footer>
      </div>
    </main>
  );
}
