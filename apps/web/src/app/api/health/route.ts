export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { service: "tywish-web", status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
