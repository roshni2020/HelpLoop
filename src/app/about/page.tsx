// The pitch, in the product. What it is, who it's for, how it works,
// which track each part serves, and what we'd build next.

export const dynamic = "force-static";

const STEPS = [
  {
    n: "1",
    title: "Someone asks",
    body: "Four answers: what they need (food, clothes, shelter), where they are, who they are (student, parent, senior…), and how they'll get there. No account, no ID.",
    track: null,
  },
  {
    n: "2",
    title: "Linkup researches the open web",
    body: "One structured search across food-bank directories, 211 and city pages. Every result is stored as a finding. Then the pipeline looks at what each finding does NOT say — hours, walk-in policy, eligibility — and searches again for exactly that. Contradictions between sources are flagged and a verification query settles them. Everything is cited.",
    track: "Linkup · Deep Research",
  },
  {
    n: "3",
    title: "Nebius ranks for this person",
    body: "The verified list plus the person's situation go to one model on Token Factory with one job: score each option and say why, in plain words. A pantry that closes before dinner, requires a student ID they don't have, or can't be walked to loses — and the reason is shown.",
    track: "Nebius · Applied AI",
  },
  {
    n: "4",
    title: "Convex connects a volunteer, live",
    body: "The request becomes a shared row both screens subscribe to. A volunteer taps 'I can help'; the requester's screen changes instantly. Every status — picked up, on the way, delivered — flows the same way. The volunteer's position is tracked but only ever shared rounded to a quarter mile.",
    track: "Convex · Multiplayer",
  },
  {
    n: "5",
    title: "The map makes it visible",
    body: "A 3D city with real buildings and terrain. The person waves until help comes; riders travel the route; MISSION ACCEPTED and HELP DELIVERED flash on both screens. Help becomes something you can watch arrive.",
    track: "NERDCONF · Fun Build",
  },
];

const AUDIENCES = [
  {
    who: "People in a hard week",
    what: "Students between paychecks, a parent whose fridge is empty on a Thursday, someone newly unhoused. They don't need a directory; they need one answer they can act on tonight, and a hand getting there.",
  },
  {
    who: "Volunteers with an hour",
    what: "People who would help if it were as easy as accepting a ride request. No training, no shifts, no background paperwork for the MVP — just a live map and one button.",
  },
  {
    who: "Cities, campuses and 211s",
    what: "They already publish the data. What they lack is the last mile: turning scattered listings into a verified answer and a person who shows up. HelpLoop is that layer on top of what they have.",
  },
];

const BUSINESS = [
  {
    title: "Campus and city licensing",
    body: "A university food-security office or a city human-services department pays a flat annual fee for a branded instance: their resources prioritised, their volunteers, their dashboard of unmet need by neighbourhood. Sales cycle is slow but retention is high.",
  },
  {
    title: "211 and food-bank partnerships",
    body: "211 networks and regional food banks run helplines staffed by humans reading the same directories. HelpLoop's research pipeline is the tool their navigators would use — sold per seat, with the verification trail as the audit record.",
  },
  {
    title: "Outcome data nobody has",
    body: "Today no one knows whether the person who called 211 actually got fed. Every HelpLoop request closes with a delivered/not-delivered outcome and a timestamp. That dataset — where help succeeds and where it stalls — is what funders and cities pay for.",
  },
];

const NEXT = [
  ["Real GPS on the volunteer side", "The privacy rounding is built; the phone app that feeds it is next."],
  ["Organisations posting directly", "Let a pantry claim its listing and correct hours in one tap — the research trail becomes the fallback, not the source."],
  ["Bigger evaluation set", "20 scenarios proves the pipeline; 200 with real outcomes proves the model."],
  ["Volunteer trust", "Ratings, ID verification, and a safety check-in for both sides before this leaves a hackathon."],
  ["Clothes and shelter, hardened", "The plumbing works today (shelter finds real beds); the gap checks and labels need the same care food got."],
  ["Languages", "Spanish, Chinese and Vietnamese first — the people who need this most often aren't searching in English."],
];

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-400">
          HelpLoop
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
          Find help. Match help. Move help.
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-7 text-mist-200">
          People struggling to get basic things shouldn&apos;t have to search ten outdated
          websites and then coordinate help themselves. HelpLoop researches what&apos;s
          actually open near you, uses AI to pick the one that fits your situation, and
          connects a volunteer in realtime on a live map.
        </p>

        <Section title="How it works" sub="One request, five stages, four sponsor tracks.">
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 font-mono text-[15px] font-bold text-[#fff]">
                  {s.n}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-bold text-white">{s.title}</h3>
                    {s.track && (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                        {s.track}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[14.5px] leading-6 text-mist-400">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Who it's for">
          <div className="grid gap-3 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div key={a.who} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-[16px] font-bold text-white">{a.who}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-mist-400">{a.what}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="The business"
          sub="The people using it never pay. The institutions already spending money on this problem do."
        >
          <div className="space-y-3">
            {BUSINESS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-[16px] font-bold text-white">{b.title}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-mist-400">{b.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Honest state of things">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
              <h3 className="text-[15px] font-bold text-emerald-300">Working today, on real data</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] leading-6 text-mist-200">
                <li>• Live web research with follow-ups, conflict checks and citations</li>
                <li>• Model ranking measured at 19/20, ~1.6 s, $0.0003 per request</li>
                <li>• Realtime coordination across devices, race-safe accept</li>
                <li>• Privacy-rounded live tracking; simulated volunteers for demos</li>
                <li>• 3D map with terrain, avatars, light and dark themes</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
              <h3 className="text-[15px] font-bold text-amber-300">What we&apos;d build next</h3>
              <ul className="mt-2 space-y-1.5 text-[14px] leading-6 text-mist-200">
                {NEXT.map(([t, b]) => (
                  <li key={t}>
                    • <span className="font-semibold text-white">{t}.</span> {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <p className="mt-10 text-center text-[13px] text-ink-500">
          Built at Burning Token with Linkup, Nebius Token Factory, Convex and MapLibre.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      {sub && <p className="mt-1 text-[14.5px] text-mist-400">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
