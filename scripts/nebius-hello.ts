// The Token Factory smoke test: one request through the OpenAI-compatible
// API, with the raw response printed so there is no doubt it came back
// from Nebius.
//
//   npm run nebius:hello          one chat completion
//   npm run nebius:hello -- --models   list the models this key can call
//
// The key is read from the server environment only. It is never exposed
// to the browser: no NEXT_PUBLIC_ prefix, and every model call in the app
// goes through the /api/research route on the server.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import OpenAI from "openai";
import { nebiusBase, nebiusModel } from "../src/lib/nebius";

const key = process.env.NEBIUS_API_KEY?.trim();
if (!key) {
  console.error(
    "\n  NEBIUS_API_KEY is not set.\n" +
      "  Get one at https://tokenfactory.nebius.com and put it in .env.local:\n" +
      "    NEBIUS_API_KEY=...\n",
  );
  process.exit(1);
}

const client = new OpenAI({ apiKey: key, baseURL: nebiusBase() });

async function listModels() {
  console.log(`\n  Models available to this key (${nebiusBase()})`);
  console.log(`  ${"─".repeat(58)}`);
  const models = await client.models.list();
  const ids = models.data.map((m) => m.id).sort();
  for (const id of ids) {
    console.log(`   ${id === nebiusModel() ? "→" : " "} ${id}`);
  }
  console.log(`\n  ${ids.length} models. Current NEBIUS_MODEL: ${nebiusModel()}`);
  if (!ids.includes(nebiusModel())) {
    console.log(
      `  WARNING: ${nebiusModel()} is not in that list — set NEBIUS_MODEL to one that is.\n`,
    );
    process.exit(1);
  }
  console.log("");
}

async function hello() {
  const model = nebiusModel();
  console.log(`\n  Nebius Token Factory smoke test`);
  console.log(`  endpoint: ${nebiusBase()}`);
  console.log(`  model:    ${model}`);
  console.log(`  ${"─".repeat(58)}`);

  const started = Date.now();
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 60,
    temperature: 0,
    messages: [
      {
        role: "user",
        content:
          "In one sentence: name one thing that decides whether a food pantry is actually usable tonight by someone with no car.",
      },
    ],
  });
  const ms = Date.now() - started;

  console.log(`\n  reply: ${completion.choices[0]?.message?.content?.trim()}`);
  console.log(`\n  latency:   ${ms} ms`);
  console.log(
    `  tokens:    ${completion.usage?.prompt_tokens ?? "?"} in / ${
      completion.usage?.completion_tokens ?? "?"
    } out`,
  );
  console.log(`  finish:    ${completion.choices[0]?.finish_reason}`);
  console.log(`  id:        ${completion.id}`);
  console.log(`\n  Token Factory is reachable. Run \`npm run eval\` to score the real task.\n`);
}

const run = process.argv.includes("--models") ? listModels() : hello();

run.catch((err: unknown) => {
  const e = err as { status?: number; message?: string };
  console.error(`\n  Request failed${e.status ? ` (HTTP ${e.status})` : ""}: ${e.message}`);
  if (e.status === 401) console.error("  The key was rejected — check NEBIUS_API_KEY.");
  if (e.status === 404)
    console.error(
      `  Model not found. Run \`npm run nebius:hello -- --models\` to see what this key can call.`,
    );
  console.error("");
  process.exit(1);
});
