import { RoundPage } from "../../../features/round-page/RoundPage";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default async function Round({
  params,
}: {
  params: Promise<{ turnId: string }>;
}) {
  const { turnId } = await params;

  return (
    <SolanaProviders>
      <RoundPage turnId={turnId} />
    </SolanaProviders>
  );
}
