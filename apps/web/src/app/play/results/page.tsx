import { DrawResultPanel } from "../../../features/draw-result/DrawResultPanel";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function ResultsPage() {
  return (
    <SolanaProviders>
      <DrawResultPanel />
    </SolanaProviders>
  );
}
