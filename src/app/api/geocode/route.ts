import { geocode } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turn a typed location into a point, for the Offer form. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "q is required" }, { status: 400 });
  const point = await geocode(q);
  return Response.json(point);
}
