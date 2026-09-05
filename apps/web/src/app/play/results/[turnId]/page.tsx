import { notFound } from "next/navigation";

import { PlayRoute } from "../../../../features/tyche/PlayRoute";

export default async function PlayRoundResultPage({
  params,
}: {
  params: Promise<{ turnId: string }>;
}) {
  const { turnId: rawTurnId } = await params;
  const turnId = Number(rawTurnId);

  if (!Number.isInteger(turnId) || turnId <= 0) {
    notFound();
  }

  return <PlayRoute resultTurnId={turnId} screen="result" />;
}
