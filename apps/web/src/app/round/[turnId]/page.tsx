import { notFound } from "next/navigation";

import { IdealerApp } from "../../../features/idealer/IdealerApp";
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
      <IdealerApp initialScreen="result" initialResultTurnId={parsedTurnId} />
    </SolanaProviders>
  );
}
