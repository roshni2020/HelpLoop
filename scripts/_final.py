import pathlib, re

def patch(path, pairs):
    p = pathlib.Path(path); s = p.read_text(encoding="utf-8")
    for old, new in pairs:
        assert old in s, f"{path}: missing {old[:70]!r}"
        s = s.replace(old, new, 1)
    p.write_text(s, encoding="utf-8")

# ── ResourceResults: research summary box + clearer best-match card ──
p = pathlib.Path("src/components/ResourceResults.tsx"); s = p.read_text(encoding="utf-8")

s = s.replace(
'import type { RankMeta, RankedResource, Resource } from "@/lib/types";',
'import type { RankMeta, RankedResource, ResearchFinding, Resource } from "@/lib/types";')

# add findings prop
s = s.replace(
"""  busy?: boolean;
  cta?: string;
}) {
  const byId""",
"""  busy?: boolean;
  cta?: string;
  findings?: ResearchFinding[];
}) {
  const byId""")
s = s.replace(
"""  busy,
  cta = "Need pickup help",
}: {
  resources: Resource[];""",
"""  busy,
  cta = "Need pickup help",
  findings = [],
}: {
  resources: Resource[];""")

# summary box after PanelHeader (first occurrence of the results list container)
old_list = """      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {best && ("""
new_list = """      <ResearchSummary resources={resources} findings={findings} />

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {best && ("""
assert old_list in s
s = s.replace(old_list, new_list, 1)

# best card: "Why it fits" label + sources + verification line
old_reason = re.search(r'      <h3 className="text-\[\d+(?:\.\d+)?px\] font-bold leading-tight text-white">\{resource\.name\}</h3>\n      <p className="mt-1 text-\[\d+(?:\.\d+)?px\] leading-5 text-amber-100/85">\{rank\.reason\}</p>', s)
assert old_reason, "best card reason block"
s = s.replace(old_reason.group(0), """      <h3 className="text-[17px] font-bold leading-tight text-white">{resource.name}</h3>
      <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-amber-300/80">
        Why it fits
      </p>
      <p className="mt-0.5 text-[13.5px] leading-5 text-amber-100/90">{rank.reason}</p>
      <Verification resource={resource} />""", 1)

# helper components appended
s += """

/** One line judges can read at a glance: what the research actually did. */
function ResearchSummary({
  resources,
  findings,
}: {
  resources: Resource[];
  findings: ResearchFinding[];
}) {
  const followUps = findings.filter((f) => f.kind === "gap").length;
  const conflicts = findings.filter((f) => f.kind === "conflict").length;
  const multiSource = resources.filter((r) => r.sources.length >= 2).length;
  const unresolved = resources.reduce((n, r) => n + r.gaps.length, 0);
  return (
    <div className="grid grid-cols-2 gap-1.5 border-b border-white/10 px-3 py-2.5 text-[12.5px]">
      <span className="text-mist-200">🔎 Found {resources.length} resources</span>
      <span className="text-sky-300">↩ {followUps} follow-up searches</span>
      <span className="text-emerald-300">✓ {multiSource} verified from 2+ sources</span>
      <span className={unresolved ? "text-amber-300" : "text-mist-400"}>
        {conflicts ? `⚠ ${conflicts} conflict${conflicts === 1 ? "" : "s"} settled · ` : ""}
        {unresolved ? `${unresolved} detail${unresolved === 1 ? "" : "s"} still unverified` : "all details verified"}
      </span>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  hours: "hours",
  walkIn: "walk-in",
  diet: "diet",
  eligibility: "eligibility",
  availability: "beds tonight",
  address: "address",
};

/** What we verified vs. what we couldn't, plus how many sources back it. */
function Verification({ resource }: { resource: Resource }) {
  const all = ["hours", "walkIn", "eligibility", "address"];
  const unverified = resource.gaps.filter((g) => all.includes(g) || g === "availability");
  const verified = all.filter((f) => !resource.gaps.includes(f));
  const n = resource.sources.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-mist-200">
        {n} source{n === 1 ? "" : "s"}
      </span>
      {verified.length > 0 && (
        <span className="text-emerald-300">✓ {verified.map((f) => FIELD_LABEL[f]).join(", ")}</span>
      )}
      {unverified.length > 0 && (
        <span className="text-amber-300">? {unverified.map((f) => FIELD_LABEL[f] ?? f).join(", ")} unverified</span>
      )}
    </div>
  );
}
"""
p.write_text(s, encoding="utf-8")

# ── page.tsx: pass findings, mount the banner ──
patch("src/app/page.tsx", [
("""import LiveRequestCard from "@/components/LiveRequestCard";""",
 """import LiveRequestCard from "@/components/LiveRequestCard";
import MissionBanner from "@/components/MissionBanner";"""),
("""                  busy={creating}
                  cta={need?.category === "shelter" ? "Need help getting there" : "Need pickup help"}
                />""",
 """                  busy={creating}
                  cta={need?.category === "shelter" ? "Need help getting there" : "Need pickup help"}
                  findings={research.findings}
                />"""),
("""      {/* Left rail: the request, then the ranked results */}""",
 """      <MissionBanner status={myRequest?.status} />

      {/* Left rail: the request, then the ranked results */}"""),
])

# ── volunteer page: banner too ──
patch("src/app/volunteer/page.tsx", [
("""import { useRealtime } from "@/components/RealtimeProvider";""",
 """import { useRealtime } from "@/components/RealtimeProvider";
import MissionBanner from "@/components/MissionBanner";"""),
("""      <div className="pointer-events-none absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col gap-3 overflow-y-auto p-3 md:max-w-[440px]">
        <div className="flex shrink-0 flex-col gap-3">
          <Panel className="hl-rise overflow-hidden">
            <PanelHeader
              title={`Hi ${name} 👋`}""",
 """      <MissionBanner status={activeJob?.status ?? (myDone.length ? "delivered" : null)} />

      <div className="absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col gap-3 overflow-y-auto p-3 md:max-w-[440px]">
        <div className="flex shrink-0 flex-col gap-3">
          <Panel className="hl-rise overflow-hidden">
            <PanelHeader
              title={`Hi ${name} 👋`}"""),
])

# ── bigger status headline on the request card ──
p = pathlib.Path("src/components/LiveRequestCard.tsx"); s = p.read_text(encoding="utf-8")
s = re.sub(r'<h3 className="mt-1\.5 text-\[\d+(?:\.\d+)?px\] font-bold text-white">', '<h3 className="mt-1.5 text-[22px] font-black tracking-tight text-white">', s, count=1)
p.write_text(s, encoding="utf-8")

# ── category chips: food is the demo; others marked beta ──
patch("src/components/RequestHelpForm.tsx", [
("""              {c.emoji} {c.label}
            </button>""",
 """              {c.emoji} {c.label}
              {c.value !== "food" && (
                <span className="ml-1 rounded bg-white/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-mist-400">
                  beta
                </span>
              )}
            </button>"""),
])
print("final polish patched")
