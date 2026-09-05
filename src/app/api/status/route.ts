import { linkupConfigured } from "@/lib/linkup";
import { nebiusConfigured, nebiusModel } from "@/lib/nebius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which tracks are live vs. running on the built-in fallback. */
export async function GET() {
  return Response.json({
    linkup: { configured: linkupConfigured(), depth: process.env.LINKUP_DEPTH ?? "standard" },
    nebius: { configured: nebiusConfigured(), model: nebiusModel() },
    convex: { configured: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim()) },
  });
}
