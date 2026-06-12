"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import {
  compileTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";

const PENDING_ACTION_KEY = "idealer.wallet.pending-action";
const PREFERRED_WALLETS = [
  { name: "Phantom", browseBaseUrl: "https://phantom.app/ul/browse/" },
  { name: "Backpack", browseBaseUrl: "https://backpack.app/ul/v1/browse/" },
  { name: "Solflare", browseBaseUrl: "https://solflare.com/ul/v1/browse/" },
] as const;

type PersistedActionType = "connect_wallet" | "devnet_test_transaction";
type TransactionStatus =
  | "idle"
  | "awaiting_approval"
  | "pending"
  | "confirmed"
  | "failed";

interface PersistedWalletAction {
  action: PersistedActionType;
  connectorName?: string;
  createdAt: string;
  errorCode?: string;
  errorMessage?: string;
  signature?: string;
  status: Exclude<TransactionStatus, "idle">;
  version: 1;
  walletAddress?: string;
}

interface TransactionFeedback {
  errorCode?: string;
  message: string;
  signature?: string;
  status: TransactionStatus;
}

function readPersistedAction(): PersistedWalletAction | null {
  const stored = window.localStorage.getItem(PENDING_ACTION_KEY);
  if (!stored) {
    return null;
  }

  try {
    const action = JSON.parse(stored) as Partial<PersistedWalletAction>;
    if (
      action.version !== 1 ||
      (action.action !== "connect_wallet" &&
        action.action !== "devnet_test_transaction") ||
      !action.createdAt ||
      !action.status
    ) {
      throw new Error("Pending wallet action has an invalid shape.");
    }
    return action as PersistedWalletAction;
  } catch {
    window.localStorage.removeItem(PENDING_ACTION_KEY);
    return {
      action: "devnet_test_transaction",
      createdAt: new Date().toISOString(),
      errorCode: "BAD_REQUEST",
      errorMessage:
        "A saved wallet action was invalid and could not be recovered.",
      status: "failed",
      version: 1,
    };
  }
}

function persistAction(action: PersistedWalletAction) {
  window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
}

function clearPersistedAction() {
  window.localStorage.removeItem(PENDING_ACTION_KEY);
}

function normalizeError(
  error: unknown,
  fallbackCode: string,
  rejectedCode = "TRANSACTION_REJECTED",
) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("reject") ||
    normalizedMessage.includes("declin") ||
    normalizedMessage.includes("cancel")
  ) {
    return {
      code: rejectedCode,
      message: "The wallet request was rejected. Your DApp state is unchanged.",
    };
  }

  return {
    code: fallbackCode,
    message,
  };
}

function truncateAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

function getWalletBrowseUrl(baseUrl: string) {
  const destination = new URL(
    "/play/wallet",
    window.location.origin,
  ).toString();
  return `${baseUrl}${encodeURIComponent(destination)}?ref=${encodeURIComponent(window.location.origin)}`;
}

function WalletPhoneChrome() {
  return (
    <>
      <div className="platform-dynamic-island" aria-hidden="true" />
      <div className="platform-statusbar" aria-hidden="true">
        <span>9:41</span>
        <span className="platform-status-icons">
          <i className="platform-cell-signal">
            <b />
            <b />
            <b />
            <b />
          </i>
          <i className="platform-wifi">⌁</i>
          <i className="platform-battery" />
        </span>
      </div>
      <div className="platform-home-indicator" aria-hidden="true" />
    </>
  );
}

function TransactionStatusCard({
  feedback,
  onRetry,
}: {
  feedback: TransactionFeedback;
  onRetry: () => void;
}) {
  if (feedback.status === "idle") {
    return null;
  }

  const isPending =
    feedback.status === "awaiting_approval" || feedback.status === "pending";
  const isConfirmed = feedback.status === "confirmed";

  return (
    <article
      aria-live="polite"
      className={`wallet-status-card ${isConfirmed ? "success" : ""} ${
        feedback.status === "failed" ? "failure" : ""
      }`}
    >
      {isPending ? (
        <LoaderCircle aria-hidden="true" className="wallet-spinner" size={22} />
      ) : null}
      {isConfirmed ? <CheckCircle2 aria-hidden="true" size={22} /> : null}
      {feedback.status === "failed" ? (
        <AlertCircle aria-hidden="true" size={22} />
      ) : null}
      <div>
        <strong>
          {feedback.status === "awaiting_approval"
            ? "Awaiting wallet approval"
            : null}
          {feedback.status === "pending" ? "Transaction pending" : null}
          {feedback.status === "confirmed" ? "Transaction confirmed" : null}
          {feedback.status === "failed" ? "Transaction failed" : null}
        </strong>
        <p>{feedback.message}</p>
        {feedback.errorCode ? <code>{feedback.errorCode}</code> : null}
        {feedback.signature ? (
          <a
            href={`https://explorer.solana.com/tx/${feedback.signature}?cluster=devnet`}
            rel="noreferrer"
            target="_blank"
          >
            View devnet transaction{" "}
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        ) : null}
      </div>
      {feedback.status === "failed" ? (
        <button
          className="wallet-inline-action"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
          Retry
        </button>
      ) : null}
    </article>
  );
}

export function WalletFlow() {
  const client = useSolanaClient();
  const {
    connect,
    connected,
    connecting,
    connectors,
    currentConnector,
    disconnect,
    error: connectionError,
    isReady,
    wallet,
  } = useWalletConnection();
  const [connectionMessage, setConnectionMessage] = useState("");
  const [feedback, setFeedback] = useState<TransactionFeedback>({
    message: "",
    status: "idle",
  });
  const [preferredWalletLinks, setPreferredWalletLinks] = useState<
    Array<(typeof PREFERRED_WALLETS)[number] & { href: string }>
  >([]);
  const signatureStatus = useWaitForSignature(feedback.signature, {
    commitment: "confirmed",
    disabled: !feedback.signature,
    subscribe: true,
  });

  const walletAddress = wallet?.account.address.toString();
  useEffect(() => {
    setPreferredWalletLinks(
      PREFERRED_WALLETS.map((preferredWallet) => ({
        ...preferredWallet,
        href: getWalletBrowseUrl(preferredWallet.browseBaseUrl),
      })),
    );
  }, []);

  useEffect(() => {
    const persisted = readPersistedAction();
    if (!persisted) {
      return;
    }

    if (persisted.action === "connect_wallet") {
      setConnectionMessage(
        connected
          ? "Wallet connection recovered after returning to the DApp."
          : "A wallet connection handoff was interrupted. Choose a wallet to retry.",
      );
      if (connected) {
        clearPersistedAction();
      }
      return;
    }

    setFeedback({
      message:
        persisted.errorMessage ??
        (persisted.signature
          ? "Recovered the submitted transaction and resumed devnet confirmation."
          : "Recovered the approval step. Retry to request a fresh wallet approval."),
      ...(persisted.errorCode ? { errorCode: persisted.errorCode } : {}),
      ...(persisted.signature ? { signature: persisted.signature } : {}),
      status: persisted.signature ? "pending" : persisted.status,
    });
  }, [connected]);

  useEffect(() => {
    if (!feedback.signature) {
      return;
    }

    if (signatureStatus.isSuccess) {
      const confirmedFeedback: TransactionFeedback = {
        message:
          "The zero-SOL test transaction was confirmed on Solana devnet.",
        signature: feedback.signature,
        status: "confirmed",
      };
      setFeedback(confirmedFeedback);
      persistAction({
        action: "devnet_test_transaction",
        createdAt: new Date().toISOString(),
        signature: feedback.signature,
        status: "confirmed",
        version: 1,
        ...(walletAddress ? { walletAddress } : {}),
      });
    } else if (signatureStatus.isError) {
      const normalized = normalizeError(
        signatureStatus.waitError,
        "TRANSACTION_FAILED",
      );
      setFeedback({
        errorCode: normalized.code,
        message: normalized.message,
        signature: feedback.signature,
        status: "failed",
      });
    }
  }, [
    feedback.signature,
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
    walletAddress,
  ]);

  async function handleConnect(connectorId: string, connectorName: string) {
    setConnectionMessage("");
    persistAction({
      action: "connect_wallet",
      connectorName,
      createdAt: new Date().toISOString(),
      status: "awaiting_approval",
      version: 1,
    });

    try {
      await connect(connectorId);
      clearPersistedAction();
      setConnectionMessage(`Connected with ${connectorName} on Solana devnet.`);
    } catch (error) {
      const normalized = normalizeError(
        error,
        "WALLET_CONNECTION_FAILED",
        "WALLET_CONNECTION_FAILED",
      );
      persistAction({
        action: "connect_wallet",
        connectorName,
        createdAt: new Date().toISOString(),
        errorCode: normalized.code,
        errorMessage: normalized.message,
        status: "failed",
        version: 1,
      });
      setConnectionMessage(`${normalized.code}: ${normalized.message}`);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    clearPersistedAction();
    setFeedback({ message: "", status: "idle" });
    setConnectionMessage("Wallet disconnected.");
  }

  async function sendTestTransaction() {
    if (!wallet || !walletAddress) {
      setFeedback({
        errorCode: "UNAUTHORIZED",
        message: "Connect a wallet before requesting a test transaction.",
        status: "failed",
      });
      return;
    }

    const awaitingAction: PersistedWalletAction = {
      action: "devnet_test_transaction",
      createdAt: new Date().toISOString(),
      status: "awaiting_approval",
      version: 1,
      walletAddress,
      ...(currentConnector?.name
        ? { connectorName: currentConnector.name }
        : {}),
    };
    persistAction(awaitingAction);
    setFeedback({
      message:
        "Approve the zero-SOL self-transfer in your wallet, then return to this page.",
      status: "awaiting_approval",
    });

    try {
      const prepared = await client.solTransfer.prepareTransfer({
        amount: 0n,
        authority: wallet,
        destination: wallet.account.address,
      });
      const simulationWire = getBase64EncodedWireTransaction(
        compileTransaction(prepared.message),
      );
      const simulation = await client.runtime.rpc
        .simulateTransaction(simulationWire, {
          commitment: "confirmed",
          encoding: "base64",
          replaceRecentBlockhash: false,
          sigVerify: false,
        })
        .send();

      if (simulation.value.err) {
        throw new Error(
          `Devnet simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }

      const signature = (
        await client.solTransfer.sendPreparedTransfer(prepared, {
          commitment: "confirmed",
          maxRetries: 3,
          skipPreflight: false,
        })
      ).toString();

      persistAction({
        ...awaitingAction,
        signature,
        status: "pending",
      });
      setFeedback({
        message: "Wallet approval returned. Waiting for devnet confirmation.",
        signature,
        status: "pending",
      });
    } catch (error) {
      const normalized = normalizeError(error, "TRANSACTION_FAILED");
      persistAction({
        ...awaitingAction,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        status: "failed",
      });
      setFeedback({
        errorCode: normalized.code,
        message: normalized.message,
        status: "failed",
      });
    }
  }

  const effectiveConnectionError = connectionError
    ? normalizeError(
        connectionError,
        "WALLET_CONNECTION_FAILED",
        "WALLET_CONNECTION_FAILED",
      )
    : null;

  return (
    <main className="platform-stage">
      <div className="platform-phone-shell">
        <WalletPhoneChrome />
        <section
          className="platform-screen platform-wallet-screen"
          aria-labelledby="wallet-flow-title"
        >
          <div className="platform-ambient" />
          <div className="platform-scroll platform-wallet-scroll">
            <header className="platform-screen-header">
              <Link aria-label="Back to live round" href="/play">
                <ArrowLeft aria-hidden="true" size={20} />
              </Link>
              <div>
                <p className="platform-section-label">Solana devnet</p>
                <h1 id="wallet-flow-title">Connect your mobile wallet.</h1>
              </div>
            </header>

            <article className="wallet-security-note">
              <ShieldCheck aria-hidden="true" size={21} />
              <p>
                Idealer never asks for your seed phrase or private key. Wallet
                approval happens inside your selected wallet.
              </p>
            </article>

            {connected && walletAddress ? (
              <>
                <article className="wallet-connected-card">
                  <span>
                    <Wallet aria-hidden="true" size={21} />
                  </span>
                  <div>
                    <small>
                      Connected with{" "}
                      {currentConnector?.name ?? "Wallet Standard"}
                    </small>
                    <strong>{truncateAddress(walletAddress)}</strong>
                    <p>Solana devnet</p>
                  </div>
                  <button
                    aria-label="Disconnect wallet"
                    onClick={handleDisconnect}
                    type="button"
                  >
                    <LogOut aria-hidden="true" size={18} />
                  </button>
                </article>

                <article className="wallet-transaction-card">
                  <p className="platform-section-label">Test transaction</p>
                  <h2>Approve and return safely.</h2>
                  <p>
                    This sends <strong>0 SOL</strong> from your wallet back to
                    itself on devnet. No value moves, but the wallet may charge
                    a devnet network fee.
                  </p>
                  <dl>
                    <div>
                      <dt>Cluster</dt>
                      <dd>Devnet</dd>
                    </div>
                    <div>
                      <dt>Recipient</dt>
                      <dd>{truncateAddress(walletAddress)}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>0 SOL</dd>
                    </div>
                    <div>
                      <dt>RPC preflight</dt>
                      <dd>Required</dd>
                    </div>
                  </dl>
                  <button
                    className="wallet-primary-action"
                    disabled={
                      feedback.status === "awaiting_approval" ||
                      feedback.status === "pending"
                    }
                    onClick={sendTestTransaction}
                    type="button"
                  >
                    {feedback.status === "awaiting_approval" ||
                    feedback.status === "pending" ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="wallet-spinner"
                        size={18}
                      />
                    ) : (
                      <ShieldCheck aria-hidden="true" size={18} />
                    )}
                    Approve test transaction
                  </button>
                </article>
              </>
            ) : (
              <>
                <section
                  className="wallet-connectors"
                  aria-labelledby="available-wallets-title"
                >
                  <div>
                    <p className="platform-section-label">Wallet Standard</p>
                    <h2 id="available-wallets-title">Available wallets</h2>
                  </div>
                  {!isReady ? <p>Detecting compatible wallets...</p> : null}
                  {isReady && connectors.length === 0 ? (
                    <p>
                      No compatible wallet was detected in this browser. Open
                      Idealer inside a mobile wallet below or install a Wallet
                      Standard wallet.
                    </p>
                  ) : null}
                  <div className="wallet-connector-list">
                    {connectors.map((connector) => (
                      <button
                        disabled={connecting}
                        key={connector.id}
                        onClick={() =>
                          handleConnect(connector.id, connector.name)
                        }
                        type="button"
                      >
                        {connector.icon ? (
                          // Wallet Standard icons are trusted connector metadata and remain isolated here.
                          <img
                            alt=""
                            height="34"
                            src={connector.icon}
                            width="34"
                          />
                        ) : (
                          <Wallet aria-hidden="true" size={22} />
                        )}
                        <span>
                          <strong>{connector.name}</strong>
                          <small>
                            {connecting
                              ? "Waiting for wallet..."
                              : "Connect on devnet"}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  className="wallet-mobile-links"
                  aria-labelledby="mobile-wallets-title"
                >
                  <div>
                    <Smartphone aria-hidden="true" size={20} />
                    <div>
                      <p className="platform-section-label">
                        Mobile browser handoff
                      </p>
                      <h2 id="mobile-wallets-title">Open inside your wallet</h2>
                    </div>
                  </div>
                  <p>
                    These official browse links open this exact step inside the
                    wallet's in-app browser.
                  </p>
                  <div>
                    {preferredWalletLinks.map((preferredWallet) => (
                      <a
                        href={preferredWallet.href}
                        key={preferredWallet.name}
                      >
                        {preferredWallet.name}
                        <ExternalLink aria-hidden="true" size={15} />
                      </a>
                    ))}
                  </div>
                </section>
              </>
            )}

            {connectionMessage ? (
              <p className="wallet-connection-message">{connectionMessage}</p>
            ) : null}
            {effectiveConnectionError ? (
              <p className="wallet-error-message" role="alert">
                {effectiveConnectionError.code}:{" "}
                {effectiveConnectionError.message}
              </p>
            ) : null}
            <TransactionStatusCard
              feedback={feedback}
              onRetry={sendTestTransaction}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
