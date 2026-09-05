// A follow-up search that comes back empty must never be shown as a
// confirmed fact. This pins the phrasings we treat as "nothing found".
import { NO_INFO_RE } from "../src/lib/research";

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
process.exit(bad ? 1 : 0);
