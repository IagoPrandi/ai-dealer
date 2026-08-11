import { TreasuryBudgetRequestApp } from "../../../../../features/treasury-budget/TreasuryBudgetRequestApp";
import { SolanaProviders } from "../../../../../solana/SolanaProviders";

export default function TreasuryBudgetRequestPage() {
  return <SolanaProviders><TreasuryBudgetRequestApp /></SolanaProviders>;
}
