import { rankResources } from "@/lib/nebius";
import type { HelpNeed, Resource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Standalone ranking endpoint — used to re-rank after a manual edit. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { need: HelpNeed; resources: Resource[] };
    if (!body?.need || !Array.isArray(body.resources)) {
      return Response.json({ error: "need and resources are required" }, { status: 400 });
    }
    const result = await rankResources(body.need, body.resources);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ranking failed" },
      { status: 500 },
    );
  }
}
