import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

interface CaseResult {
  id: string;
  title: string;
  probe: string;
  expectedName: string;
  predictedName: string;
  correct: boolean;
  expectedInTop2: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  label: string;
  modelReason: string;
  ranking: { id: string; name: string; score: number }[];
}

interface Summary {
  scenarios: number;
  top1Correct: number;
  top1Accuracy: number;
  top2Correct: number;
  top2Accuracy: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokens: number;
  avgCostUsd: number;
  totalCostUsd: number;
}

interface Report {
  generatedAt: string;
  model: string;
  live: boolean;
  evaluatedAt: string;
  summary: Summary;
  baseline: Summary | null;
  cases: CaseResult[];
}

async function loadReport(): Promise<Report | null> {
  try {
    const raw = await readFile(resolve(process.cwd(), "data/eval-results.json"), "utf8");
    return JSON.parse(raw) as Report;
  } catch {
    return null;
  }
}

/**
 * Every `data/eval-<model>.json` written by `npm run eval -- --model …`,
 * so the model choice can be shown as a comparison rather than asserted.
 */
async function loadComparison(): Promise<Report[]> {
  try {
    const dir = resolve(process.cwd(), "data");
    const files = (await readdir(dir)).filter(
      (f) => f.startsWith("eval-") && f.endsWith(".json") && f !== "eval-results.json",
    );
    const reports = await Promise.all(
      files.map(async (f) => {
        try {
          return JSON.parse(await readFile(resolve(dir, f), "utf8")) as Report;
        } catch {
          return null;
        }
      }),
    );
    return reports
      .filter((r): r is Report => Boolean(r?.live && r.summary))
      .sort((a, b) => a.summary.p95LatencyMs - b.summary.p95LatencyMs);
  } catch {
    return [];
  }
}

export default async function EvalPage() {
  const report = await loadReport();
  const comparison = await loadComparison();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="mb-7">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-violet-400">
            Track 2 · Nebius Token Factory
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white">
            Resource matching evaluation
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-mist-400">
            Twenty hand-labelled scenarios, each isolating one decision the matcher
            has to get right — a dietary requirement against a shorter walk, a closed
            door against an open one, an appointment barrier against a walk-in. The
            label is the option a caseworker would send the person to.
          </p>
        </header>

        {!report ? (
          <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-8 text-center">
            <div className="text-3xl">📊</div>
            <h2 className="mt-2 text-[17px] font-semibold text-white">
              No evaluation run yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-mist-400">
              Results are measured, never assumed — so this page stays empty until you
              run the harness yourself.
            </p>
            <pre className="mx-auto mt-4 w-fit rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left font-mono text-[13.5px] text-emerald-300">
              npm run eval -- --baseline
            </pre>
            <p className="mt-3 text-[12.5px] text-ink-500">
              Set NEBIUS_API_KEY first to score the model; without it the run measures
              the built-in heuristic instead.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-2.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${
                  report.live
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                }`}
              >
                {report.live ? "Nebius Token Factory" : "heuristic fallback"}
              </span>
              <code className="font-mono text-[12.5px] text-mist-200">{report.model}</code>
              <span className="ml-auto text-[12px] text-ink-500">
                run {new Date(report.generatedAt).toLocaleString()} · scenarios scored as
                of {new Date(report.evaluatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Top-1 accuracy"
                value={`${(report.summary.top1Accuracy * 100).toFixed(0)}%`}
                sub={`${report.summary.top1Correct}/${report.summary.scenarios} correct`}
                accent
              />
              <Stat
                label="Top-2 contains answer"
                value={`${(report.summary.top2Accuracy * 100).toFixed(0)}%`}
                sub={`${report.summary.top2Correct}/${report.summary.scenarios}`}
              />
              <Stat
                label="Avg inference"
                value={`${(report.summary.avgLatencyMs / 1000).toFixed(2)}s`}
                sub={`p50 ${report.summary.p50LatencyMs}ms · p95 ${report.summary.p95LatencyMs}ms`}
              />
              <Stat
                label="Avg cost / request"
                value={
                  report.summary.avgCostUsd
                    ? `$${report.summary.avgCostUsd.toFixed(5)}`
                    : "—"
                }
                sub={
                  report.summary.totalTokens
                    ? `${report.summary.totalTokens.toLocaleString()} tokens total`
                    : "no usage reported"
                }
              />
            </div>

            {report.baseline && (
              <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-2.5 text-[13.5px] text-mist-400">
                Built-in heuristic baseline on the same set:{" "}
                <span className="font-semibold text-mist-200">
                  {report.baseline.top1Correct}/{report.baseline.scenarios} (
                  {(report.baseline.top1Accuracy * 100).toFixed(0)}%)
                </span>
                {report.summary.top1Accuracy > report.baseline.top1Accuracy
                  ? " — the model earns its place on the cases where rules alone are too blunt."
                  : report.summary.top1Accuracy === report.baseline.top1Accuracy
                    ? " — a tie on this set; the model's advantage is the reasoning it shows the user."
                    : " — the rules win here, which is worth saying out loud."}
              </p>
            )}

            <FailureSection cases={report.cases} />

            <ModelComparison reports={comparison} chosen={report.model} />

            <Limitations n={report.summary.scenarios} accuracy={report.summary.top1Accuracy} />

            <h2 className="mb-2.5 mt-7 text-[15px] font-semibold text-white">
              All {report.cases.length} scenarios
            </h2>
            <ol className="space-y-2">
              {report.cases.map((c, i) => (
                <li
                  key={c.id}
                  className={`rounded-xl border p-3.5 ${
                    c.correct
                      ? "border-white/8 bg-white/[0.02]"
                      : "border-rose-400/30 bg-rose-400/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12.5px] ${
                        c.correct
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-rose-400/15 text-rose-300"
                      }`}
                    >
                      {c.correct ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-white">
                        <span className="mr-1.5 font-mono text-[11.5px] text-ink-500">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {c.title}
                      </p>
                      <p className="mt-0.5 text-[13px] italic text-mist-400">{c.probe}</p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.ranking.map((r, ri) => (
                          <span
                            key={r.id}
                            className={`rounded-lg border px-2 py-0.5 font-mono text-[11.5px] ${
                              ri === 0
                                ? c.correct
                                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                  : "border-rose-400/30 bg-rose-400/10 text-rose-300"
                                : "border-white/10 bg-white/5 text-mist-400"
                            }`}
                          >
                            {r.name} {r.score}
                          </span>
                        ))}
                      </div>

                      <p className="mt-2 text-[13px] leading-5 text-mist-400">
                        <span className="text-mist-200">Model:</span> {c.modelReason}
                      </p>
                      {!c.correct && (
                        <p className="mt-1 text-[13px] leading-5 text-rose-200">
                          <span className="font-semibold">Expected {c.expectedName}:</span>{" "}
                          {c.label}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[11.5px] text-ink-500">
                      {c.latencyMs}ms
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-violet-400/30 bg-gradient-to-br from-violet-500/15 to-sky-500/10"
          : "border-white/10 bg-white/[0.025]"
      }`}
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-mist-400">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[12px] text-ink-500">{sub}</p>
    </div>
  );
}

function FailureSection({ cases }: { cases: CaseResult[] }) {
  const failures = cases.filter((c) => !c.correct);
  if (!failures.length) {
    return (
      <p className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-2.5 text-[13.5px] text-emerald-200">
        No failures on this run. That is a small set, not a guarantee — the honest read
        is that these twenty cases are the ones we know it handles.
      </p>
    );
  }
  const worst = failures[0];
  return (
    <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/[0.05] p-4">
      <h2 className="text-[15px] font-semibold text-white">
        Where it fails ({failures.length}/{cases.length})
      </h2>
      <p className="mt-1 text-[13.5px] leading-5 text-mist-400">
        The most instructive miss: <span className="text-white">{worst.title}</span>.
        The label says <span className="text-emerald-300">{worst.expectedName}</span>{" "}
        because {lower(worst.label)} The model chose{" "}
        <span className="text-rose-300">{worst.predictedName}</span>, reasoning:{" "}
        <span className="italic">“{worst.modelReason}”</span>
      </p>
    </div>
  );
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Why this model and not another. On a 20-case set the accuracies land on
 * top of each other, so the choice is made on latency — which is a real
 * difference a user feels, and the one thing here we can measure sharply.
 */
function ModelComparison({ reports, chosen }: { reports: Report[]; chosen: string }) {
  if (reports.length < 2) return null;
  const fastest = reports[0];
  const slowest = reports[reports.length - 1];
  const factor = slowest.summary.p95LatencyMs / Math.max(1, fastest.summary.p95LatencyMs);

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <h2 className="text-[15px] font-semibold text-white">
        Why this model — same set, {reports.length} models
      </h2>
      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11.5px] uppercase tracking-[0.08em] text-mist-400">
              <th className="pb-1.5 pr-3 font-semibold">Model</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Top-1</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">p50</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">p95</th>
              <th className="pb-1.5 text-right font-semibold">$ / req</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const isChosen = r.model === chosen;
              return (
                <tr
                  key={r.model}
                  className={`border-b border-white/5 ${isChosen ? "text-white" : "text-mist-400"}`}
                >
                  <td className="py-1.5 pr-3 font-mono">
                    {isChosen && <span className="mr-1 text-emerald-400">→</span>}
                    {r.model}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {r.summary.top1Correct}/{r.summary.scenarios}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {(r.summary.p50LatencyMs / 1000).toFixed(2)}s
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-mono ${
                      r.summary.p95LatencyMs > 10000 ? "text-rose-300" : ""
                    }`}
                  >
                    {(r.summary.p95LatencyMs / 1000).toFixed(2)}s
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    ${r.summary.avgCostUsd.toFixed(5)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-[13px] leading-5 text-mist-400">
        Accuracy is a tie — at this sample size the intervals overlap almost
        entirely, so none of these is measurably more accurate than another.
        Tail latency is not a tie: p95 spans{" "}
        <span className="font-semibold text-white">{factor.toFixed(0)}×</span>{" "}
        across the set. Someone who has not eaten is waiting on this call, so
        the model was chosen on the tail, not the average — and{" "}
        <span className="font-mono text-mist-200">
          {slowest.model.split("/").pop()}
        </span>{" "}
        was dropped for a {(slowest.summary.p95LatencyMs / 1000).toFixed(0)}s
        worst case despite matching on quality.
      </p>
    </section>
  );
}

/**
 * Stated plainly, because a number without its error bar oversells itself.
 * The Wilson interval is wide at n=20 and that is the honest headline.
 */
function Limitations({ n, accuracy }: { n: number; accuracy: number }) {
  const [lo, hi] = wilson(accuracy, n);
  return (
    <section className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
      <h2 className="text-[15px] font-semibold text-white">
        What this measurement does not tell you
      </h2>
      <ul className="mt-2 space-y-2 text-[13.5px] leading-5 text-mist-400">
        <li>
          <span className="font-semibold text-amber-200">
            {n} scenarios is too few to rank two models.
          </span>{" "}
          At {(accuracy * 100).toFixed(0)}% the 95% confidence interval runs{" "}
          <span className="font-mono text-mist-200">
            {(lo * 100).toFixed(0)}%–{(hi * 100).toFixed(0)}%
          </span>
          . A run scoring 5 points higher has not been shown to be better. Treat
          this as a regression check that catches gross failures, not a
          leaderboard.
        </li>
        <li>
          <span className="font-semibold text-amber-200">
            The labels are our judgment, not outcomes.
          </span>{" "}
          Each answer is what we believe a caseworker would choose. Nobody was
          actually sent to these places and asked whether they got fed.
        </li>
        <li>
          <span className="font-semibold text-amber-200">
            The candidate lists are synthetic.
          </span>{" "}
          Each scenario is hand-built to isolate one decision. Real Linkup
          results are messier — missing fields, near-duplicate organizations,
          stale hours — and the ranking is only ever as good as the research
          underneath it.
        </li>
        <li>
          <span className="font-semibold text-amber-200">
            Latency is single-request, from one machine.
          </span>{" "}
          No batching, no concurrency, one network path. It says what a user
          waits, not what the endpoint sustains under load.
        </li>
      </ul>
    </section>
  );
}

/** Wilson score interval — behaves sanely at small n, unlike normal approx. */
function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)];
}
