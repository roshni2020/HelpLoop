import { parseWalkIn, findConflict, parseClosingMinutes, formatMinutes } from "../src/lib/gaps";

const cases: [string, boolean | undefined][] = [
  ["Walk-ins are welcome. No appointment, referral or registration is needed to eat.", true],
  ["The dinner service page states that an appointment is required for the grocery program. Separately, the city meal directory lists Eastside Community Kitchen as accepting walk-ins for the hot dinner service.", undefined],
  ["Confirmed by the kitchen's own FAQ: walk-ins are welcome for the hot evening meal with no appointment. The appointment requirement applies only to the separate weekly grocery box pickup.", true],
  ["An appointment is required.", false],
  ["By appointment only.", false],
  ["Open to all, no ID.", true],
  ["Referral from a caseworker is required", false],
  ["You do not need an appointment to receive a meal.", true],
];
let bad = 0;
for (const [text, want] of cases) {
  const got = parseWalkIn(text);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  want=${String(want).padEnd(9)} got=${String(got).padEnd(9)} ${text.slice(0, 62)}`);
}

console.log("\nconflict detection:");
const conflict = findConflict("walkIn", undefined, cases[1][0]);
console.log(conflict ? `ok    ${conflict.claimA.slice(0,50)} || ${conflict.claimB.slice(0,50)}` : "FAIL  no conflict on the contradictory answer");
if (!conflict) bad++;
const noConflict = findConflict("walkIn", undefined, cases[0][0]);
console.log(noConflict ? `FAIL  false positive: ${noConflict.claimA}` : "ok    no false conflict on the agreeing answer");
if (noConflict) bad++;

console.log("\nhours:");
for (const h of ["Open most evenings", "Mon-Fri 10am - 5pm", "Daily 9am - 9pm", "24 hours", "serves dinner from 4:00 PM and closes at 8:00 PM", "5:30 PM until 7:30 PM"]) {
  console.log(`  ${formatMinutes(parseClosingMinutes(h)).padEnd(9)} <- "${h}"`);
}
process.exit(bad ? 1 : 0);
