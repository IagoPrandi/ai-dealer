import { notFound } from "next/navigation";

import { TycheApp } from "../../../features/tyche/TycheApp";
import { SolanaProviders } from "../../../solana/SolanaProviders";

export default async function Round({
  params,
}: {
  params: Promise<{ turnId: string }>;
}) {
  const { turnId } = await params;
  const parsedTurnId = Number(turnId);

  if (!Number.isInteger(parsedTurnId) || parsedTurnId <= 0) {
    notFound();
  }

  return (
    <SolanaProviders>
      <TycheApp initialScreen="result" initialResultTurnId={parsedTurnId} />
    </SolanaProviders>
  );
}
