"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClusterState, useSolanaClient, useWalletConnection } from "@solana/react-hooks";

import { SQUADS_DEVNET_CONFIG } from "../../solana/squadsDevnetConfig";
import {
  type PreparedTreasuryWalletAction,
  type TreasuryOverview,
  prepareTreasuryBudgetProposal,
  readTreasuryOverview,
  signSimulateSendAndVerifyTreasuryAction,
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

interface PreparedBudget {
  budget: {
    destination: string;
    limitId: bigint;
    maxLamports: bigint;
    operator: string;
    periodSeconds: bigint;
  };
  prepared: PreparedTreasuryWalletAction;
  proposalAddress: string;
  transactionAddress: string;
  transactionIndex: bigint;
}

export function TreasuryBudgetRequestApp() {
  const client = useSolanaClient();
  const cluster = useClusterState();
  const connection = useWalletConnection();
  const preparedRef = useRef<PreparedBudget | null>(null);
  const walletAddress = connection.wallet?.account.address.toString() ?? "";
  const member = useMemo(
    () => SQUADS_DEVNET_CONFIG.members.find((candidate) => candidate.address === walletAddress),
    [walletAddress],
  );
  const [accepted, setAccepted] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"reading" | "preparing" | "submitting" | null>(null);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TreasuryOverview | null>(null);
  const [periodDays, setPeriodDays] = useState("30");
  const [prepared, setPrepared] = useState<PreparedBudget | null>(null);
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<{ signature: string; transactionIndex: bigint } | null>(null);

  const rpcEndpoint = cluster.endpoint.toString();

  useEffect(() => {
    let active = true;
    setBusy("reading");
    readTreasuryOverview(rpcEndpoint)
      .then((next) => {
        if (active) setOverview(next);
      })
      .catch((readError) => {
        if (active) setError(describeError(readError));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => { active = false; };
  }, [rpcEndpoint]);

  useEffect(() => {
    preparedRef.current = null;
    setPrepared(null);
    setAccepted(false);
    setResult(null);
  }, [walletAddress]);

  function invalidateReview() {
    preparedRef.current = null;
    setPrepared(null);
    setAccepted(false);
    setResult(null);
  }

  async function refreshOverview() {
    setBusy("reading");
    setError(null);
    try {
      setOverview(await readTreasuryOverview(rpcEndpoint));
    } catch (readError) {
      setError(describeError(readError));
    } finally {
      setBusy(null);
    }
  }

  async function prepare() {
    if (!member) return;
    setBusy("preparing");
    setError(null);
    try {
      const days = Number(periodDays);
      if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
        throw new Error("Budget period must be an integer from 1 to 365 days.");
      }
      const next = await prepareTreasuryBudgetProposal({
        creatorAddress: member.address,
        destination,
        maxLamports: parseSolToLamports(amount),
        periodSeconds: BigInt(days) * 86_400n,
        purpose,
        rpcEndpoint,
      });
      preparedRef.current = next;
      setPrepared(next);
      setAccepted(false);
    } catch (prepareError) {
      setError(describeError(prepareError));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const current = preparedRef.current;
    if (!current || !connection.wallet || !accepted) return;
    setBusy("submitting");
    setError(null);
    try {
      const signature = await signSimulateSendAndVerifyTreasuryAction({
        client,
        prepared: current.prepared,
        wallet: connection.wallet,
      });
      setResult({ signature, transactionIndex: current.transactionIndex });
      preparedRef.current = null;
      setPrepared(null);
      setAccepted(false);
      await refreshOverview();
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
          <div className="tm-brand"><span className="tm-brand-mark">J</span><span>JUSDEALER treasury</span></div>
          <span className="tm-network">Devnet only</span>
          <p className="tm-eyebrow">Governed SOL budget</p>
          <h1>Request a treasury transfer budget</h1>
          <p className="tm-lead">Define one destination, a maximum SOL amount, and a period. The request becomes usable only after the Squads 2-of-3 multisig approves and executes it.</p>
          <TreasuryNavigation current="request" />
        </header>

        <section className="tm-card" aria-labelledby="treasury-state-title">
          <div className="tm-section-heading">
            <div><p className="tm-eyebrow">Live state</p><h2 id="treasury-state-title">Treasury capacity</h2></div>
            <span className={`tm-status${overview?.cancellationReady ? " tm-status-ready" : ""}`}>
              {busy === "reading" ? "Reading" : overview?.cancellationReady ? "Ready" : "Upgrade required"}
            </span>
          </div>
          <TreasuryMetrics overview={overview} />
          {!overview?.cancellationReady ? (
            <div className="tb-warning">New budget creation is intentionally locked until the reviewed Tokenomics Core upgrade with post-approval cancellation is deployed through governance.</div>
          ) : null}
          <button className="tm-button tm-button-secondary" disabled={busy !== null} onClick={() => void refreshOverview()} type="button">Refresh balances</button>
        </section>

        <WalletPanel busy={busy !== null} connection={connection} error={setError} memberLabel={member ? memberLabel(member.address) : null} />

        <section className="tm-card" aria-labelledby="budget-details-title">
          <div className="tm-section-heading">
            <div><p className="tm-eyebrow">Budget definition</p><h2 id="budget-details-title">Set the spending boundary</h2></div>
            <span className="tm-status">No transfer yet</span>
          </div>
          <p className="tm-muted">The connected member becomes the budget operator. Approval activates a repeatable maximum for each period; every transfer is still signed by that operator and can go only to this destination.</p>
          <div className="tb-form-grid">
            <label className="tb-field tb-field-wide">
              <span>Destination address</span>
              <input autoComplete="off" disabled={busy !== null} onChange={(event) => { setDestination(event.target.value.trim()); invalidateReview(); }} placeholder="Solana address" spellCheck={false} value={destination} />
            </label>
            <label className="tb-field">
              <span>Maximum per period (SOL)</span>
              <input disabled={busy !== null} inputMode="decimal" onChange={(event) => { setAmount(event.target.value); invalidateReview(); }} placeholder="0.00" value={amount} />
            </label>
            <label className="tb-field">
              <span>Period</span>
              <select disabled={busy !== null} onChange={(event) => { setPeriodDays(event.target.value); invalidateReview(); }} value={periodDays}>
                <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option>
              </select>
            </label>
            <label className="tb-field tb-field-wide">
              <span>Public purpose</span>
              <textarea disabled={busy !== null} maxLength={120} onChange={(event) => { setPurpose(event.target.value); invalidateReview(); }} placeholder="Explain why this budget should be approved." value={purpose} />
            </label>
          </div>
          <button className="tm-button" disabled={!member || !overview?.cancellationReady || busy !== null} onClick={() => void prepare()} type="button">
            {busy === "preparing" ? "Verifying proposal..." : "Prepare multisig proposal"}
          </button>
        </section>

        {prepared ? (
          <section className="tm-card tm-submit" aria-labelledby="budget-review-title">
            <div className="tm-section-heading"><div><p className="tm-eyebrow">Required review</p><h2 id="budget-review-title">Sign proposal creation</h2></div><span className="tm-status">Wallet approval</span></div>
            <dl className="tm-details">
              <div><dt>Budget ID</dt><dd>{prepared.budget.limitId.toString()}</dd></div>
              <div><dt>Maximum</dt><dd>{formatUnits(prepared.budget.maxLamports)} SOL / {periodDays} day(s)</dd></div>
              <div><dt>Destination</dt><dd className="tb-code" title={prepared.budget.destination}>{prepared.budget.destination}</dd></div>
              <div><dt>Operator</dt><dd>{memberLabel(prepared.budget.operator)}</dd></div>
            </dl>
            <label className="tm-confirm">
              <input checked={accepted} disabled={busy !== null} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
              <span>I reviewed devnet, destination {prepared.budget.destination}, maximum {formatUnits(prepared.budget.maxLamports)} SOL every {periodDays} day(s), public purpose, operator, canonical treasury accounts, and the zero-approval Squads proposal. I understand this does not transfer SOL or approve the budget.</span>
            </label>
            <button className="tm-button tm-button-create" disabled={!accepted || busy !== null} onClick={() => void submit()} type="button">
              {busy === "submitting" ? "Simulating and awaiting finalization..." : "Sign and create proposal"}
            </button>
          </section>
        ) : null}

        {result ? (
          <section className="tm-card tm-success" aria-labelledby="budget-created-title">
            <p className="tm-eyebrow">Strict verification passed</p><h2 id="budget-created-title">Budget proposal created</h2>
            <p>Proposal {result.transactionIndex.toString()} is active with zero approvals. Two distinct multisig members must approve it before execution activates the budget.</p>
            <div className="tm-success-links">
              <a href={`/dev/tokenomics/treasury/approve?transactionIndex=${result.transactionIndex.toString()}`}>Open approval page</a>
              <ExplorerLink path={`tx/${result.signature}`}>View transaction</ExplorerLink>
            </div>
          </section>
        ) : null}

        {error ? <div className="tm-error tm-error-banner" role="alert">{error}</div> : null}
        <footer className="tm-footer">A budget does not custody extra SOL and cannot redirect funds. The multisig can deactivate it after approval; finalized transfers are not reversible.</footer>
      </div>
    </main>
  );
}
