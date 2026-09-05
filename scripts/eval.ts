// ─────────────────────────────────────────────────────────────
// Nebius evaluation harness.
//
//   npm run eval              full run against Nebius
//   npm run eval -- --baseline  also score the heuristic ranker
//   npm run eval -- --limit 5   quick smoke run
//
// Writes data/eval-results.json, which the /eval page renders.
// ─────────────────────────────────────────────────────────────

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });
config({ path: ".env" });

import { heuristicRank, nebiusConfigured, nebiusModel, rankResources } from "../src/lib/nebius";
import { EVAL_NOW, SCENARIOS, type Scenario } from "./eval-scenarios";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `--model <id>` overrides NEBIUS_MODEL for this run. */
const modelArg = process.argv.indexOf("--model");
if (modelArg >= 0 && process.argv[modelArg + 1]) {
  process.env.NEBIUS_MODEL = process.argv[modelArg + 1];
}
/** `--out <name>` writes data/<name>.json instead of the default report. */
const outArg = process.argv.indexOf("--out");
const OUT = resolve(
  __dirname,
  `../data/${outArg >= 0 && process.argv[outArg + 1] ? process.argv[outArg + 1] : "eval-results"}.json`,
);

interface CaseResult {
  id: string;
  title: string;
  probe: string;
  expectedTopId: string;
  expectedName: string;
  predictedTopId: string;
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

async function runOne(
  scenario: Scenario,
  forceHeuristic: boolean,
): Promise<CaseResult> {
  const { ranking, meta } = await rankResources(scenario.need, scenario.resources, {
    now: EVAL_NOW,
    forceHeuristic,
  });

  const top = ranking[0];
  const nameOf = (id: string) =>
    scenario.resources.find((r) => r.id === id)?.name ?? id;

  return {
    id: scenario.id,
    title: scenario.title,
    probe: scenario.probe,
    expectedTopId: scenario.expectedTopId,
    expectedName: nameOf(scenario.expectedTopId),
    predictedTopId: top?.resourceId ?? "",
    predictedName: top?.name ?? "—",
    correct: top?.resourceId === scenario.expectedTopId,
    expectedInTop2: ranking
      .slice(0, 2)
      .some((r) => r.resourceId === scenario.expectedTopId),
    latencyMs: meta.latencyMs,
    promptTokens: meta.promptTokens,
    completionTokens: meta.completionTokens,
    costUsd: meta.costUsd,
    label: scenario.label,
    modelReason: top?.reason ?? "",
    ranking: ranking.map((r) => ({ id: r.resourceId, name: r.name, score: r.score })),
  };
}

function summarize(cases: CaseResult[]) {
  const n = cases.length || 1;
  const correct = cases.filter((c) => c.correct).length;
  const top2 = cases.filter((c) => c.expectedInTop2).length;
  const latencies = cases.map((c) => c.latencyMs).sort((a, b) => a - b);
  const totalCost = cases.reduce((s, c) => s + (c.costUsd ?? 0), 0);
  const totalTokens = cases.reduce(
    (s, c) => s + (c.promptTokens ?? 0) + (c.completionTokens ?? 0),
    0,
  );

  return {
    scenarios: cases.length,
    top1Correct: correct,
    top1Accuracy: correct / n,
    top2Correct: top2,
    top2Accuracy: top2 / n,
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / n),
    p50LatencyMs: latencies[Math.floor(latencies.length / 2)] ?? 0,
    p95LatencyMs: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? 0,
    totalTokens,
    avgCostUsd: totalCost / n,
    totalCostUsd: totalCost,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : SCENARIOS.length;
  const withBaseline = args.includes("--baseline");
  const scenarios = SCENARIOS.slice(0, limit);

  const live = nebiusConfigured();
  const model = live ? nebiusModel() : "helploop-heuristic-v1 (NEBIUS_API_KEY not set)";

  console.log(`\n  HelpLoop — resource matching evaluation`);
  console.log(`  model:     ${model}`);
  console.log(`  scenarios: ${scenarios.length}`);
  console.log(`  ${"─".repeat(66)}`);

  const cases: CaseResult[] = [];
  for (const [i, scenario] of scenarios.entries()) {
    process.stdout.write(
      `  ${String(i + 1).padStart(2, "0")}/${scenarios.length}  ${scenario.title.padEnd(38).slice(0, 38)} `,
    );
    const result = await runOne(scenario, !live);
    cases.push(result);
    console.log(
      `${result.correct ? "PASS" : "FAIL"}  ${String(result.latencyMs).padStart(5)} ms` +
        (result.correct ? "" : `   expected ${result.expectedName}, got ${result.predictedName}`),
    );
  }

  const summary = summarize(cases);

  let baseline: ReturnType<typeof summarize> | null = null;
  if (withBaseline) {
    console.log(`\n  Baseline (built-in heuristic)…`);
    const baseCases: CaseResult[] = [];
    for (const scenario of scenarios) {
      const { ranking } = heuristicRank(scenario.need, scenario.resources, EVAL_NOW);
      baseCases.push({
        id: scenario.id,
        title: scenario.title,
        probe: scenario.probe,
        expectedTopId: scenario.expectedTopId,
        expectedName:
          scenario.resources.find((r) => r.id === scenario.expectedTopId)?.name ??
          scenario.expectedTopId,
        predictedTopId: ranking[0]?.resourceId ?? "",
        predictedName: ranking[0]?.name ?? "—",
        correct: ranking[0]?.resourceId === scenario.expectedTopId,
        expectedInTop2: ranking.slice(0, 2).some((r) => r.resourceId === scenario.expectedTopId),
        latencyMs: 0,
        label: scenario.label,
        modelReason: ranking[0]?.reason ?? "",
        ranking: ranking.map((r) => ({ id: r.resourceId, name: r.name, score: r.score })),
      });
    }
    baseline = summarize(baseCases);
  }

  const failures = cases.filter((c) => !c.correct);

  console.log(`\n  ${"─".repeat(66)}`);
  console.log(`  Top-1 correct    ${summary.top1Correct}/${summary.scenarios}   (${pct(summary.top1Accuracy)})`);
  console.log(`  Top-2 contains   ${summary.top2Correct}/${summary.scenarios}   (${pct(summary.top2Accuracy)})`);
  console.log(`  Latency          avg ${summary.avgLatencyMs} ms · p50 ${summary.p50LatencyMs} ms · p95 ${summary.p95LatencyMs} ms`);
  if (summary.totalTokens) {
    console.log(`  Tokens           ${summary.totalTokens} total`);
    console.log(`  Cost             $${summary.avgCostUsd.toFixed(6)} per request · $${summary.totalCostUsd.toFixed(5)} for the run`);
  }
  if (baseline) {
    console.log(`  Heuristic base   ${baseline.top1Correct}/${baseline.scenarios}   (${pct(baseline.top1Accuracy)})`);
  }

  if (failures.length) {
    console.log(`\n  Where it went wrong:`);
    for (const f of failures) {
      console.log(`   ✗ ${f.title}`);
      console.log(`     expected ${f.expectedName} — ${f.label}`);
      console.log(`     chose    ${f.predictedName} — ${f.modelReason}`);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    model,
    live,
    evaluatedAt: EVAL_NOW.toISOString(),
    summary,
    baseline,
    cases,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\n  Report written to data/eval-results.json — open /eval to view it.\n`);
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
