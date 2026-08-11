"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClusterState, useSolanaClient, useWalletConnection } from "@solana/react-hooks";

import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import {
  type PreparedTreasuryWalletAction,
  type TreasuryGovernanceAction,
  type TreasuryOverview,
  type TreasuryProposalState,
  prepareTreasuryBudgetCancellationProposal,
  prepareTreasuryBudgetSpend,
  prepareTreasuryGovernanceAction,
  readTreasuryOverview,
  readTreasuryProposalState,
  signSimulateSendAndVerifyTreasuryAction,
  treasuryGovernanceAvailability,
} from "../../solana/treasuryBudget";
import { parseSolToLamports } from "../../solana/treasuryBudgetInstructions";
import "../tokenomics-multisig/tokenomics-multisig.css";
import "./treasury-budget.css";
import { WalletPanel } from "./WalletPanel";
import {
  describeError,
  ExplorerLink,
  formatUnits,
  memberLabel,
  TreasuryMetrics,
  TreasuryNavigation,
} from "./shared";

type ReviewKind = TreasuryGovernanceAction | "cancel" | "spend";

interface PreparedReview {
  cancellationIndex?: bigint;
  prepared: PreparedTreasuryWalletAction;
  review: string;
  type: ReviewKind;
}

function isActiveRecord(state: TreasuryProposalState | null) {
  return state && "active" in state.budget ? state.budget : null;
}

function periodLabel(seconds: bigint) {
  return seconds % 86_400n === 0n
    ? `${(seconds / 86_400n).toString()} day(s)`
    : `${seconds.toString()} seconds`;
}

function effectiveRemaining(state: TreasuryProposalState | null) {
  const budget = isActiveRecord(state);
  if (!budget) return null;
  const now = BigInt(Math.floor(Date.now() / 1_000));
  const spent = now >= budget.periodStartedAt + budget.periodSeconds ? 0n : budget.spentInPeriodLamports;
  return budget.maxLamports - spent;
}

export function TreasuryBudgetApprovalApp({ initialTransactionIndex = "" }: { initialTransactionIndex?: string }) {
  const client = useSolanaClient();
  const cluster = useClusterState();
  const connection = useWalletConnection();
  const preparedRef = useRef<PreparedReview | null>(null);
  const walletAddress = connection.wallet?.account.address.toString() ?? "";
  const member = useMemo(
    () => SQUADS_DEVNET_CONFIG.members.find((candidate) => candidate.address === walletAddress),
    [walletAddress],
  );
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"reading" | "preparing" | "submitting" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TreasuryOverview | null>(null);
  const [prepared, setPrepared] = useState<PreparedReview | null>(null);
  const [result, setResult] = useState<{ cancellationIndex?: bigint; signature: string; type: ReviewKind } | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [state, setState] = useState<TreasuryProposalState | null>(null);
  const [transactionIndex, setTransactionIndex] = useState(initialTransactionIndex);
  const rpcEndpoint = cluster.endpoint.toString();
  const record = isActiveRecord(state);
  const remaining = effectiveRemaining(state);
  const availability = state && member
    ? treasuryGovernanceAvailability({ memberAddress: member.address, state })
    : { canApprove: false, canExecute: false };

  useEffect(() => {
    preparedRef.current = null;
    setPrepared(null);
    setAccepted(false);
    setResult(null);
  }, [walletAddress, transactionIndex]);

  async function refresh(loadProposal = true) {
    setBusy("reading");
    setError(null);
    try {
      const nextOverview = await readTreasuryOverview(rpcEndpoint);
      setOverview(nextOverview);
      if (loadProposal && transactionIndex.trim()) {
        if (!/^\d+$/.test(transactionIndex.trim())) throw new Error("Proposal index must be a non-negative integer.");
        setState(await readTreasuryProposalState({ rpcEndpoint, transactionIndex: BigInt(transactionIndex.trim()) }));
      } else if (loadProposal) {
        setState(null);
      }
    } catch (readError) {
      if (loadProposal) setState(null);
      setError(describeError(readError));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refresh(Boolean(initialTransactionIndex));
    // The initial load is intentionally tied only to the connected endpoint.
  }, [rpcEndpoint]);

  function setReview(next: PreparedReview) {
    preparedRef.current = next;
    setPrepared(next);
    setAccepted(false);
    setResult(null);
  }

  async function prepareGovernance(action: TreasuryGovernanceAction) {
    if (!member || !state) return;
    setBusy("preparing"); setError(null);
    try {
      const next = await prepareTreasuryGovernanceAction({ action, memberAddress: member.address, rpcEndpoint, transactionIndex: state.transactionIndex });
      setReview({
        prepared: next,
        review: `${action === "approve" ? "Approve" : "Execute"} Squads proposal ${state.transactionIndex.toString()} for the exact ${state.kind === "activate-budget" ? "budget activation" : "budget cancellation"} stored on-chain.`,
        type: action,
      });
    } catch (prepareError) { setError(describeError(prepareError)); }
    finally { setBusy(null); }
  }

  async function prepareCancellation() {
    if (!member || !record || !state || state.kind !== "activate-budget") return;
    setBusy("preparing"); setError(null);
    try {
      const next = await prepareTreasuryBudgetCancellationProposal({ creatorAddress: member.address, limitId: record.limitId, reason: cancelReason, rpcEndpoint });
      setReview({
        cancellationIndex: next.transactionIndex,
        prepared: next.prepared,
        review: `Create cancellation proposal ${next.transactionIndex.toString()} for active budget ${record.limitId.toString()}. Cancellation stops future transfers but cannot reverse settled transfers. Public reason: ${cancelReason.trim()}`,
        type: "cancel",
      });
    } catch (prepareError) { setError(describeError(prepareError)); }
    finally { setBusy(null); }
  }

  async function prepareSpend() {
    if (!record || !connection.wallet) return;
    setBusy("preparing"); setError(null);
    try {
      const lamports = parseSolToLamports(spendAmount);
      const next = await prepareTreasuryBudgetSpend({ amountLamports: lamports, limitId: record.limitId, operatorAddress: walletAddress, rpcEndpoint });
      setReview({
        prepared: next,
        review: `Transfer ${formatUnits(lamports)} SOL from Treasury SOL Vault to the immutable budget destination ${record.destination}. This transfer settles immediately and cannot be reversed.`,
        type: "spend",
      });
    } catch (prepareError) { setError(describeError(prepareError)); }
    finally { setBusy(null); }
  }

  async function submit() {
    const current = preparedRef.current;
    if (!current || !connection.wallet || !accepted) return;
    setBusy("submitting"); setError(null);
    try {
      const signature = await signSimulateSendAndVerifyTreasuryAction({ client, prepared: current.prepared, wallet: connection.wallet });
      setResult({
        ...(current.cancellationIndex === undefined
          ? {}
          : { cancellationIndex: current.cancellationIndex }),
        signature,
        type: current.type,
      });
      preparedRef.current = null; setPrepared(null); setAccepted(false);
      await refresh(current.type !== "cancel");
    } catch (submitError) { setError(describeError(submitError)); }
    finally { setBusy(null); }
  }

  return (
    <main className="tm-shell">
      <div className="tm-glow" aria-hidden="true" />
      <div className="tm-layout">
        <header className="tm-hero">
          <div className="tm-brand"><span className="tm-brand-mark">J</span><span>JUSDEALER treasury</span></div>
          <span className="tm-network">Devnet only</span>
          <p className="tm-eyebrow">Squads governance</p>
          <h1>Govern and use a treasury budget</h1>
          <p className="tm-lead">Inspect treasury capacity, approve the exact stored proposal, activate its destination-bound budget, transfer within its limit, or propose cancellation at any time.</p>
          <TreasuryNavigation current="approve" />
        </header>

        <section className="tm-card" aria-labelledby="governance-capacity-title">
          <div className="tm-section-heading">
            <div><p className="tm-eyebrow">Required context</p><h2 id="governance-capacity-title">Treasury snapshot</h2></div>
            <span className={`tm-status${overview?.cancellationReady ? " tm-status-ready" : ""}`}>{overview?.cancellationReady ? "Verified" : "Upgrade required"}</span>
          </div>
          <TreasuryMetrics overview={overview} />
          {!overview?.cancellationReady ? <div className="tb-warning">Approval can be recorded, but proposal execution and new budget creation remain locked until the reviewed cancellable-budget program artifact is deployed.</div> : null}
        </section>

        <section className="tm-card" aria-labelledby="proposal-lookup-title">
          <div className="tm-section-heading"><div><p className="tm-eyebrow">Proposal lookup</p><h2 id="proposal-lookup-title">Read strict on-chain state</h2></div><span className={`tm-status${state ? " tm-status-ready" : ""}`}>{state?.status ?? "Not loaded"}</span></div>
          <label className="tb-field">
            <span>Squads transaction index</span>
            <input disabled={busy !== null} inputMode="numeric" onChange={(event) => setTransactionIndex(event.target.value)} placeholder="Example: 12" value={transactionIndex} />
          </label>
          <button className="tm-button" disabled={busy !== null || !transactionIndex.trim()} onClick={() => void refresh()} type="button">{busy === "reading" ? "Verifying devnet..." : "Load proposal"}</button>
          {state ? (
            <>
              <dl className="tm-details">
                <div><dt>Action</dt><dd>{state.kind === "activate-budget" ? "Activate budget" : "Cancel budget"}</dd></div>
                <div><dt>Status</dt><dd>{state.status}</dd></div>
                <div><dt>Budget ID</dt><dd>{state.budget.limitId.toString()}</dd></div>
                <div><dt>Maximum</dt><dd>{formatUnits(state.budget.maxLamports)} SOL / {periodLabel(state.budget.periodSeconds)}</dd></div>
                <div><dt>Destination</dt><dd className="tb-code" title={state.budget.destination}>{state.budget.destination}</dd></div>
                <div><dt>Operator</dt><dd className="tb-code" title={state.budget.operator}>{memberLabel(state.budget.operator)}</dd></div>
                {state.cancellationReasonHash ? <div><dt>Cancellation reason hash</dt><dd className="tb-code" title={state.cancellationReasonHash}>{state.cancellationReasonHash}</dd></div> : null}
                {record ? <><div><dt>Budget state</dt><dd>{record.active ? "Active" : "Cancelled"}</dd></div><div><dt>Remaining this period</dt><dd>{formatUnits(remaining ?? 0n)} SOL</dd></div></> : null}
              </dl>
              <div className="tb-votes">
                {SQUADS_DEVNET_CONFIG.members.map((candidate) => (
                  <div className="tb-vote" key={candidate.address}>
                    <span>{candidate.label}</span><code title={candidate.address}>{candidate.address}</code>
                    <strong className={state.approved.includes(candidate.address) ? "tb-approved" : ""}>{state.approved.includes(candidate.address) ? "Approved" : "Pending"}</strong>
                  </div>
                ))}
              </div>
              <div className="tm-success-links">
                <ExplorerLink path={`address/${state.proposalAddress}`}>View proposal</ExplorerLink>
                <ExplorerLink path={`address/${state.transactionAddress}`}>View vault transaction</ExplorerLink>
              </div>
            </>
          ) : null}
        </section>

        <WalletPanel busy={busy !== null} connection={connection} error={setError} memberLabel={member ? memberLabel(member.address) : null} />

        {state && state.status !== "Executed" ? (
          <section className="tm-card" aria-labelledby="governance-action-title">
            <div className="tm-section-heading"><div><p className="tm-eyebrow">Governance action</p><h2 id="governance-action-title">Approve or execute</h2></div><span className="tm-status">{state.approved.length} of {SQUADS_DEVNET_CONFIG.threshold}</span></div>
            <p className="tm-muted">Approval records one member vote. Execution is available after the 2-of-3 threshold and applies only the strictly validated transaction shown above.</p>
            <div className="tb-actions">
              <button className="tm-button" disabled={!availability.canApprove || busy !== null} onClick={() => void prepareGovernance("approve")} type="button">Prepare approval</button>
              <button className="tm-button" disabled={!availability.canExecute || !overview?.cancellationReady || busy !== null} onClick={() => void prepareGovernance("execute")} type="button">Prepare execution</button>
            </div>
          </section>
        ) : null}

        {state?.kind === "activate-budget" && state.status === "Executed" && record?.active ? (
          <>
            <section className="tm-card" aria-labelledby="budget-transfer-title">
              <div className="tm-section-heading"><div><p className="tm-eyebrow">Operator transfer</p><h2 id="budget-transfer-title">Transfer within the budget</h2></div><span className="tm-status tm-status-ready">{formatUnits(remaining ?? 0n)} SOL left</span></div>
              <p className="tm-muted">Only the configured operator can sign. Funds always go to <code className="tb-code">{record.destination}</code>.</p>
              <label className="tb-field"><span>Transfer amount (SOL)</span><input disabled={busy !== null} inputMode="decimal" onChange={(event) => { setSpendAmount(event.target.value); setPrepared(null); preparedRef.current = null; }} placeholder="0.00" value={spendAmount} /></label>
              <button className="tm-button" disabled={walletAddress !== record.operator || busy !== null} onClick={() => void prepareSpend()} type="button">Prepare transfer</button>
              {walletAddress && walletAddress !== record.operator ? <p className="tm-note">Connect the configured operator to transfer.</p> : null}
            </section>

            <section className="tm-card" aria-labelledby="budget-cancel-title">
              <div className="tm-section-heading"><div><p className="tm-eyebrow">Post-approval control</p><h2 id="budget-cancel-title">Propose budget cancellation</h2></div><span className="tm-status">Multisig required</span></div>
              <p className="tm-muted">A separate 2-of-3 proposal deactivates this budget. It prevents future transfers immediately after execution and does not claw back settled SOL.</p>
              <label className="tb-field"><span>Public cancellation reason</span><textarea disabled={busy !== null} maxLength={120} onChange={(event) => { setCancelReason(event.target.value); setPrepared(null); preparedRef.current = null; }} placeholder="Explain why this budget should be stopped." value={cancelReason} /></label>
              <button className="tm-button" disabled={!member || busy !== null} onClick={() => void prepareCancellation()} type="button">Prepare cancellation proposal</button>
            </section>
          </>
        ) : null}

        {prepared ? (
          <section className="tm-card tm-submit" aria-labelledby="treasury-review-title">
            <div className="tm-section-heading"><div><p className="tm-eyebrow">Required review</p><h2 id="treasury-review-title">Sign {prepared.type}</h2></div><span className="tm-status">Wallet approval</span></div>
            <p className="tm-muted">{prepared.review}</p>
            <label className="tm-confirm"><input checked={accepted} disabled={busy !== null} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" /><span>I reviewed the action, current proposal state, treasury balances, connected signer, destination, amount boundary, and irreversible effects described above.</span></label>
            <button className="tm-button tm-button-create" disabled={!accepted || busy !== null} onClick={() => void submit()} type="button">{busy === "submitting" ? "Simulating and awaiting finalization..." : `Sign and submit ${prepared.type}`}</button>
          </section>
        ) : null}

        {result ? (
          <section className="tm-card tm-success" aria-labelledby="treasury-result-title">
            <p className="tm-eyebrow">Strict verification passed</p><h2 id="treasury-result-title">{result.type === "cancel" ? "Cancellation proposal created" : result.type === "spend" ? "Transfer finalized" : `${result.type} finalized`}</h2>
            <p>The finalized transaction was read back from devnet and matched the prepared action.</p>
            <div className="tm-success-links">
              {result.cancellationIndex !== undefined ? <a href={`/dev/tokenomics/treasury/approve?transactionIndex=${result.cancellationIndex.toString()}`}>Open cancellation proposal</a> : null}
              <ExplorerLink path={`tx/${result.signature}`}>View transaction</ExplorerLink>
            </div>
          </section>
        ) : null}

        {error ? <div className="tm-error tm-error-banner" role="alert">{error}</div> : null}
        <footer className="tm-footer">Every state-changing action is simulated before submission and checked again at finalized commitment. This operator surface is devnet-only.</footer>
      </div>
    </main>
  );
}
