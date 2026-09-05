import { runResearch } from "@/lib/research";
import type { HelpNeed } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streams the research pipeline as newline-delimited JSON over SSE so the
 * client can render each finding, gap and conflict as it happens.
 */
export async function POST(req: Request) {
  let need: HelpNeed;
  try {
    need = normalize(await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const event of runResearch(need)) send(event);
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Research failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function normalize(body: Record<string, unknown>): HelpNeed {
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  return {
    need: str(body.need, "Food assistance"),
    locationText: str(body.locationText, "Oakland, CA"),
    lat: Number(body.lat) || 0,
    lng: Number(body.lng) || 0,
    diet: (str(body.diet, "any") as HelpNeed["diet"]) ?? "any",
    transport: (str(body.transport, "walking") as HelpNeed["transport"]) ?? "walking",
    urgency: (str(body.urgency, "tonight") as HelpNeed["urgency"]) ?? "tonight",
    who: (str(body.who, "anyone") as HelpNeed["who"]) ?? "anyone",
    notes: str(body.notes),
  };
}
