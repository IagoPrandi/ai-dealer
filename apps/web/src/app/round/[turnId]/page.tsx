import { RoundPage } from "../../../features/round-page/RoundPage";

export default async function Round({
  params,
}: {
  params: Promise<{ turnId: string }>;
}) {
  const { turnId } = await params;

  return <RoundPage turnId={turnId} />;
}
