// A follow-up search that comes back empty must never be shown as a
// confirmed fact. This pins the phrasings we treat as "nothing found".
import { DIRECTORY_RE, NO_INFO_RE, NOT_A_PLACE_RE } from "../src/lib/research";

const cases: [string, boolean][] = [
  ["The provided information does not contain specific details about eligibility requirements.", true],
  ["The provided information does not specify who is eligible.", true],
  ["No additional public information was found about hours.", true],
  ["There is no information about walk-in policy.", true],
  ["I could not find the closing time for this location.", true],
  // Real answers that happen to contain "no" must pass through.
  ["Walk-ins are welcome. No appointment, referral or registration is needed to eat.", false],
  ["St. Anne's serves an evening meal Tuesday, Thursday and Sunday from 5:30 PM until 7:30 PM.", false],
  ["Open to anyone in need. No ID and no proof of residency.", false],
  ["No ID required, no documentation, just show up.", false],
];
let bad = 0;
for (const [text, want] of cases) {
  const got = NO_INFO_RE.test(text);
  if (got !== want) bad++;
  console.log(`  ${got === want ? "ok  " : "FAIL"} ${String(want).padEnd(5)} ${text.slice(0, 72)}`);
}

// A caveat the search returned in place of a name must never become a
// listing a volunteer gets sent to. Real names must survive, oddly worded or not.
const names: [string, boolean][] = [
  ["Tonight’s options not confirmed", true],
  ["Tonight / current availability", true],
  ["Unknown", true],
  ["No verified food program was found that is confirmed open tonight (Thursday, November 5, 2026).", true],
  ["No Kid Hungry", false],
  ["St. Vincent de Paul Dining Room", false],
  ["East Bay Food Not Bombs", false],
  ["Community Kitchens", false],
  ["Healthy Options Food Bank", false],
  ["Today's Harvest Food Pantry", false],
];
// Directories point people elsewhere; a volunteer can't pick food up from one.
names.push(
  ["United Way 211 — local food resources", true],
  ["FoodNow pantry locator", true],
  ["2-1-1 Alameda County", true],
  ["Alameda County Community Food Bank", false],
);
for (const [name, want] of names) {
  const got = NOT_A_PLACE_RE.test(name) || DIRECTORY_RE.test(name);
  if (got !== want) bad++;
  console.log(`  ${got === want ? "ok  " : "FAIL"} ${String(want).padEnd(5)} ${name}`);
}
process.exit(bad ? 1 : 0);
