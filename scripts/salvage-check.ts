// Regression test for truncated model replies.
//
// gpt-oss-120b came within 100 tokens of the ceiling on a real 5-resource
// ranking and then blew through it, cutting the JSON mid-array. The whole
// ranking used to be discarded for one unterminated string. These cases
// pin the salvage behaviour so that never silently returns.

import { extractRankings, rankResources } from "../src/lib/nebius";
import type { HelpNeed, Resource } from "../src/lib/types";

let bad = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) bad++;
};

const ids = (rows: { resourceId?: string }[]) => rows.map((r) => r.resourceId).join(",");

// Cut off exactly the way a max_tokens stop cuts it: mid-string, no
// closing brace, no closing bracket.
const TRUNCATED = `{"rankings":[
 {"resourceId":"a","score":94,"reason":"Close, open late, vegetarian","concerns":[]},
 {"resourceId":"b","score":71,"reason":"Further but open","concerns":["1.9 mi walk"]},
 {"resourceId":"c","score":40,"reason":"Closes soon and requi`;

check(ids(extractRankings(TRUNCATED)) === "a,b", "salvages the intact entries from truncated JSON");

check(
  ids(
    extractRankings(
      '{"rankings":[{"resourceId":"a","score":9,"reason":"r"},{"resourceId":"b","score":8,"reason":"r"}]}',
    ),
  ) === "a,b",
  "well-formed JSON still parses whole",
);

check(
  extractRankings('```json\n{"rankings":[{"resourceId":"a","score":9,"reason":"r"}]}\n```').length === 1,
  "markdown-fenced JSON parses",
);

// A brace inside a reason string must not be read as structure.
check(
  ids(
    extractRankings(
      '{"rankings":[{"resourceId":"a","score":9,"reason":"Ask for the {special} tray"},{"resourceId":"b","score":8,"reason":"x"}]}',
    ),
  ) === "a,b",
  "braces inside strings do not confuse the scanner",
);

check(extractRankings("I could not decide, sorry.").length === 0, "prose reply yields nothing");

// Whatever the model returns, every candidate has to come back ranked.
const need: HelpNeed = {
  category: "food",
  need: "Dinner tonight",
  locationText: "Oakland, CA",
  lat: 0,
  lng: 0,
  diet: "vegetarian",
  transport: "walking",
  urgency: "tonight",
};
const res = (id: string, name: string): Resource => ({
  id,
  name,
  address: "x",
  distanceMiles: 1,
  hours: "4pm - 8pm",
  foodTypes: ["vegetarian"],
  walkIn: true,
  sources: [],
  confidence: 0.9,
  gaps: [],
  conflicts: [],
  verified: true,
});

rankResources(need, [res("a", "A"), res("b", "B"), res("c", "C")], { forceHeuristic: true })
  .then((out) => {
    check(out.ranking.length === 3, `every candidate ranked (${out.ranking.length}/3)`);
    process.exit(bad ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
