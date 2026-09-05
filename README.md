# HelpLoop — Find Help. Match Help. Move Help.

> People struggling to access basic resources shouldn't have to search ten
> outdated websites and coordinate help themselves. HelpLoop researches
> available community resources, uses AI to find the best match, and connects
> volunteers in realtime through a live community map.

Someone needs food → we find it → AI chooses the best option → a volunteer
helps → everyone sees it live.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # every key is optional — see below
npm run dev                    # http://localhost:3000
```

Open `/` in one window and `/volunteer` in another. Post a request in the
first; it appears in the second instantly, and every status change flows back.

**It works with zero API keys.** Each track degrades to a labelled fallback
rather than failing, so a dead conference wifi can't kill the demo:

| Track | Configured | Not configured |
| --- | --- | --- |
| Linkup | Live web research | Scripted demo resource set (clearly labelled fictional) |
| Nebius | Model ranking | Built-in heuristic ranker |
| Convex | Cloud realtime | Cross-tab realtime shim (still syncs two windows) |
| Map | Your style URL | Free CARTO basemap, no account |

The nav bar shows which of the four are live at any moment. Run
`npm run check` for a preflight that actually calls each configured API.

---

## The four tracks

### Track 1 — Linkup: research, not search

The pipeline lives in [`src/lib/research.ts`](src/lib/research.ts) and runs as
an async generator so the UI can watch it think.

1. **Seed search.** One structured Linkup query returns candidate resources
   with name, address, hours, eligibility, dietary options and walk-in policy.
2. **Store findings.** Every result becomes a `ResearchFinding` with its query,
   answer, sources, certainty and a `needsFollowUp` flag.
3. **Detect gaps.** [`src/lib/gaps.ts`](src/lib/gaps.ts) inspects each stored
   finding for what it does *not* say. Hours that don't parse to a closing
   time, an unknown walk-in policy, an unconfirmed dietary option — each
   becomes the next query, ordered by how much it affects the decision.
4. **Detect conflicts.** When a follow-up contradicts what we already believed
   — or cites two sources that contradict each other — the resource is flagged
   ⚠️ and a targeted verification query is sent to settle it.
5. **Score confidence.** The share of decision-relevant fields actually
   verified, penalised for anything still contradictory.

You can watch all of this in the **Research trail** panel: the follow-up
queries, the conflict, and the source that resolved it.

> *"We don't just return search results. We store research findings, detect
> missing or conflicting information, and automatically perform follow-up
> research."*

**The parser is the fiddly part** and has its own regression test —
`npm test` — covering double negatives like *"No appointment, referral or
registration is needed"*, which a naive requirement-matcher reads backwards.

### Track 2 — Nebius Token Factory: one narrow job

[`src/lib/nebius.ts`](src/lib/nebius.ts) does exactly one thing: rank the
researched resources against this person's situation and explain why. Not a
chatbot — a ranker with a measurable answer. It is the app's main task: the
⭐ best match the user acts on is the model's top-1 choice.

**Setup.** Key from <https://tokenfactory.nebius.com>, into `.env.local`:

```bash
NEBIUS_API_KEY=...
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/
NEBIUS_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

```bash
npm run models        # what this key can actually call, flags a bad NEBIUS_MODEL
npm run nebius:hello  # one request through the OpenAI-compatible API
```

`nebius:hello` prints the reply, latency, token counts, finish reason and
request id — the single-request smoke test, with receipts.

**The key never reaches the browser.** No `NEXT_PUBLIC_` prefix, so Next.js
will not inline it into client code. Every model call happens server-side in
[`/api/research`](src/app/api/research/route.ts); the browser only ever
receives scores and reasons over the event stream.

**Measurements.** Real numbers, `npm run eval -- --baseline`, 2026-09-05:

| | `openai/gpt-oss-120b` | heuristic baseline |
| --- | --- | --- |
| Top-1 correct | **19/20 (95%)** | 17/20 (85%) |
| Top-2 contains answer | 20/20 (100%) | 20/20 (100%) |
| Latency avg / p50 / p95 | 1.64s / 1.59s / 2.37s | ~0ms |
| Cost per request | $0.00027 | $0 |
| Whole 20-case run | $0.0054 | — |

20 hand-labelled scenarios in
[`scripts/eval-scenarios.ts`](scripts/eval-scenarios.ts), each isolating one
decision a real user forces: a dietary requirement against a shorter walk, a
closed door against an open one, an appointment barrier against a walk-in, a
free-text note ("two kids with me and no ID") that should flip the answer.
Every scenario is scored at a fixed 6pm so runs are comparable.

**Where the model beats the rules.** The baseline reads only structured
fields — distance, parsed closing time, dietary tags, walk-in flag. The two
cases it gets wrong and the model gets right are both free text: a campus
pantry that turns away non-students, and a note about arriving with two kids
and no ID. In the live app the same thing shows up in the reasons — the model
scores Campus Student Pantry **45** with *"requires student enrollment and
ID, and closes 5 PM"*, where the rules gave it 69.

**The failing case, reported not hidden.** `/eval` leads with it. The model
still misses *"Not urgent — best programme wins"*: given a week of
flexibility it takes tonight's soup line over a Saturday grocery pickup,
reasoning *"open now, only 1.1 mi away, walk-in, so you can get dinner
tonight"* — correct for tonight, wrong for the week that was actually asked
about.

**Model choice was made on latency, not accuracy.** Three models, same set:

| Model | Top-1 | p50 | p95 | $/req |
| --- | --- | --- | --- | --- |
| `openai/gpt-oss-120b` ← chosen | 18/20 | 1.61s | **2.31s** | $0.00027 |
| `Qwen/Qwen3-30B-A3B-Instruct-2507` | 18/20 | 3.16s | 5.12s | $0.00015 |
| `meta-llama/Llama-3.3-70B-Instruct` | 18/20 | 2.92s | **17.72s** | $0.00014 |

Identical accuracy; p95 spans 8×. On an earlier Llama run the p95 was 38s —
that tail is unstable run to run, which is itself the point. Someone who has
not eaten is waiting on this call, so the 70B was dropped for its worst case
despite matching on quality. `npm run eval -- --model <id> --out <name>`
reproduces any row, and `/eval` renders the table from whatever
`data/eval-*.json` files exist.

**The limitation to say out loud.** 20 scenarios cannot rank two models. At
19/20 the 95% Wilson interval is **76%–99%** — and the same model scored
18/20 and 19/20 on two consecutive runs. Treat it as a regression check that
catches gross failures, not a leaderboard. The labels are also our judgment
about what a caseworker would pick, not outcomes: nobody was sent to these
places and asked whether they got fed. `/eval` states all of this under the
numbers rather than in a footnote.

### Track 3 — Convex: shared task state

[`convex/`](convex/) holds the schema and functions;
[`src/components/RealtimeProvider.tsx`](src/components/RealtimeProvider.tsx)
exposes one context with two interchangeable backends. Nothing above that file
knows which is running.

The requester screen and the volunteer screen subscribe to the same request
row. A volunteer clicking **I can help** patches `status` and the requester's
screen changes from *Waiting for volunteer* to *Maya is helping you* with no
refresh, no polling. `accept` is guarded so two volunteers racing for the same
request produce one winner and one honest "someone got there first".

To use real Convex:

```bash
npx convex dev      # writes NEXT_PUBLIC_CONVEX_URL into .env.local
npm run dev:all     # runs next + convex together
```

> *"Convex is our realtime coordination layer. The requester and volunteer
> share the same task state, with status changes appearing immediately across
> sessions."*

### Track 4 — NERDCONF: the map is the product

[`src/components/MapCanvas.tsx`](src/components/MapCanvas.tsx) — MapLibre with
pitched 3D building extrusions. Requests pulse red until someone takes them.
The ranked best match glows amber with its score on the pin. Accepting a
request draws a two-leg route — volunteer → pantry → requester — as curved
arcs, and a scooter travels it: the courier's position on the map *is* the
request's status, rendered. Delivery turns the pin green and fires confetti on
both screens.

> *"We turned community assistance into a live interactive map where a
> successful match becomes a visible mission — from request to delivery."*

---

## The 90-second demo

1. **Two windows.** `/` on the left, `/volunteer` on the right. Join as *Maya*.
2. **Ask for help.** "Dinner tonight", Oakland, vegetarian, walking, tonight.
3. **Watch the research trail.** Point at the moment it says *"Missing opening
   hours — asking a follow-up"*, then *"⚠️ Conflicting information on walk-in
   policy"*, then *"✔️ Conflict settled"* with the source that settled it.
4. **Best match.** ⭐ card with the score and the model's one-line reason.
   Click **Need pickup help**.
5. **Switch windows.** The request is already there, pulsing. Click **I can
   help** — and point at the *other* window changing to "Maya is helping you"
   without a refresh. This is the Convex moment; don't rush it.
6. **Run the mission.** Picked up → On the way → Delivered. The scooter moves
   each time. Confetti, green pin, *"One less problem on the map."*
7. **`/eval`** for the numbers.

**Reset board** in the nav clears everything between run-throughs.

---

## Deploying so someone else can use it

The app is a stock Next.js 15 project — any Node host works. Vercel is the
shortest path:

```bash
npx vercel            # first run links the project
npx vercel --prod
```

Set these in the host's environment (Vercel: Project → Settings → Environment
Variables). Only the Convex one is public:

| Variable | Public? | Missing means |
| --- | --- | --- |
| `LINKUP_API_KEY` | no | demo resource set |
| `NEBIUS_API_KEY` | **no — server only** | heuristic ranking |
| `NEBIUS_BASE_URL` | no | defaults to Token Factory |
| `NEBIUS_MODEL` | no | defaults to Llama-3.3-70B-Instruct |
| `NEXT_PUBLIC_CONVEX_URL` | yes | local cross-tab shim |

Two things to know before sharing the link:

- **Convex is required for a shared deployment.** Without it the realtime
  layer is the local cross-tab shim, which is per-browser — two different
  people would each see their own private board. Run `npx convex deploy` and
  set `NEXT_PUBLIC_CONVEX_URL` to the production URL.
- **`/eval` reads `data/eval-results.json` from the repo.** Run
  `npm run eval` and commit the file before deploying, or the page shows its
  empty state.

Verify the deployment the same way this repo does locally:

```bash
BASE_URL=https://your-app.vercel.app node scripts/drive.mjs
```

That drives a real browser through request → research → rank → accept →
delivered and writes screenshots to `shots/`.

## Layout

```
src/lib/          research pipeline, gap+conflict analysis, ranking, geo
src/components/   map, realtime provider, panels
src/app/          requester (/), volunteer (/volunteer), eval (/eval), API routes
convex/           schema + realtime functions
scripts/          eval harness, 20 labelled scenarios, preflight, parser test
```

| Command | |
| --- | --- |
| `npm run dev` | app on :3000 |
| `npm run dev:all` | app + convex together |
| `npm run check` | preflight — calls each configured API for real |
| `npm run eval -- --baseline` | run the 20 scenarios, write the report |
| `npm test` | claim-parser regression test |
| `npm run typecheck` | tsc --noEmit |
| `npm run models` | list models this Nebius key can call |
| `npm run nebius:hello` | one Token Factory request, with timings |
| `npm run drive` | drive the whole demo in a real browser, screenshot it |

> If pages stop hydrating and `_next/static/chunks/main-app.js` 404s, you ran
> `next build` and `next dev` against the same `.next`. `rm -rf .next` and
> restart the dev server.

## Scope, deliberately

Three categories — food, clothing, shelter — each with its own search, gap
checks and ranking rules. Not built: payments, auth, messaging, background
checks, organization admin panels.

## A note on the demo data

When `LINKUP_API_KEY` is unset, the resources are **fictional** — invented for
[`src/lib/demo-data.ts`](src/lib/demo-data.ts) and labelled as such in the UI
and the research trail. Nobody should ever be sent to an address that doesn't
serve food. With a key set, everything shown comes from real search results
with their sources linked.
