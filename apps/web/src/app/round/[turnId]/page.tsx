import { notFound, permanentRedirect } from "next/navigation";

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

  permanentRedirect(`/rounds/${parsedTurnId}`);
}
