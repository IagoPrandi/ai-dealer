import { NumberPicker } from "../../../features/number-picker/NumberPicker";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default function PickNumbersPage() {
  return (
    <SolanaProviders>
      <NumberPicker />
    </SolanaProviders>
  );
}
