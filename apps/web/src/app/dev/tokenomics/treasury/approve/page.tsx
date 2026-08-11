import { TreasuryBudgetApprovalApp } from "../../../../../features/treasury-budget/TreasuryBudgetApprovalApp";
import { SolanaProviders } from "../../../../../solana/SolanaProviders";

export default async function TreasuryBudgetApprovalPage({ searchParams }: { searchParams: Promise<{ transactionIndex?: string | string[] }> }) {
  const params = await searchParams;
  const transactionIndex = Array.isArray(params.transactionIndex) ? params.transactionIndex[0] : params.transactionIndex;
  return <SolanaProviders><TreasuryBudgetApprovalApp initialTransactionIndex={transactionIndex ?? ""} /></SolanaProviders>;
}
