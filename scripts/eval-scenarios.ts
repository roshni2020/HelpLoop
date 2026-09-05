// ─────────────────────────────────────────────────────────────
// 20 hand-labelled matching scenarios.
//
// Each one isolates a decision the matcher has to get right: distance
// against dietary fit, an open door against a closed one, a walk-in
// against an appointment. The label is the option a caseworker would
// send the person to, and the note records why.
// ─────────────────────────────────────────────────────────────

import type { HelpNeed, Resource } from "../src/lib/types";

export interface Scenario {
  id: string;
  title: string;
  /** What this case is testing. */
  probe: string;
  need: HelpNeed;
  resources: Resource[];
  expectedTopId: string;
  /** Why that is the right answer. */
  label: string;
}

type ResourceInput = Partial<Resource> & { id: string; name: string };

function res(input: ResourceInput): Resource {
  return {
    address: `${input.name} address`,
    foodTypes: [],
    sources: ["https://example.org/source"],
    confidence: 0.8,
    gaps: [],
    conflicts: [],
    verified: true,
    ...input,
  } as Resource;
}

function need(overrides: Partial<HelpNeed> = {}): HelpNeed {
  return {
    need: "Dinner tonight",
    locationText: "Oakland, CA",
    lat: 37.8044,
    lng: -122.2712,
    diet: "any",
    transport: "walking",
    urgency: "tonight",
    ...overrides,
  };
}

/** Every scenario is scored at this wall-clock time: 6:00 PM. */
export const EVAL_NOW = new Date("2026-03-14T18:00:00");

export const SCENARIOS: Scenario[] = [
  {
    id: "s01-diet-over-distance",
    title: "Vegetarian, no car, needs food tonight",
    probe: "Does a hard dietary requirement outrank a slightly shorter walk?",
    need: need({ diet: "vegetarian", transport: "walking" }),
    resources: [
      res({
        id: "a",
        name: "Community Kitchen",
        distanceMiles: 1.2,
        hours: "4pm - 8pm",
        foodTypes: ["hot meals", "vegetarian"],
        walkIn: true,
      }),
      res({
        id: "b",
        name: "Corner Pantry",
        distanceMiles: 0.5,
        hours: "9am - 5pm",
        foodTypes: ["groceries"],
        walkIn: true,
      }),
      res({
        id: "c",
        name: "Regional Food Bank",
        distanceMiles: 3,
        hours: "9am - 9pm",
        foodTypes: ["groceries"],
        walkIn: true,
      }),
    ],
    expectedTopId: "a",
    label: "A is the only one open tonight that confirms vegetarian food and is walkable.",
  },
  {
    id: "s02-already-closed",
    title: "Closest option already closed",
    probe: "Is a closed door correctly disqualifying at 6pm?",
    need: need(),
    resources: [
      res({ id: "a", name: "Dawn Pantry", distanceMiles: 0.3, hours: "8am - 12pm", walkIn: true }),
      res({ id: "b", name: "Evening Meal Program", distanceMiles: 1.1, hours: "5pm - 8pm", walkIn: true }),
      res({ id: "c", name: "Midday Kitchen", distanceMiles: 0.6, hours: "11am - 2pm", walkIn: true }),
    ],
    expectedTopId: "b",
    label: "Only B is still serving at 6pm.",
  },
  {
    id: "s03-appointment-barrier",
    title: "Appointment-only vs. walk-in tonight",
    probe: "Does an access barrier outweigh a half-mile of distance?",
    need: need(),
    resources: [
      res({ id: "a", name: "Referral Pantry", distanceMiles: 0.4, hours: "2pm - 8pm", walkIn: false, eligibility: "Referral from a caseworker required" }),
      res({ id: "b", name: "Open Door Meals", distanceMiles: 0.9, hours: "4pm - 8pm", walkIn: true }),
    ],
    expectedTopId: "b",
    label: "Someone hungry tonight cannot obtain a referral in time.",
  },
  {
    id: "s04-car-unlocks-distance",
    title: "Has a car, best option is further out",
    probe: "Does transport correctly relax the distance penalty?",
    need: need({ transport: "car", diet: "halal" }),
    resources: [
      res({ id: "a", name: "Nearby Pantry", distanceMiles: 0.7, hours: "3pm - 7pm", foodTypes: ["groceries"], walkIn: true }),
      res({ id: "b", name: "Masjid Community Meal", distanceMiles: 6.5, hours: "5pm - 9pm", foodTypes: ["hot meals", "halal"], walkIn: true }),
    ],
    expectedTopId: "b",
    label: "With a car, 6.5 miles is fine and only B meets the halal requirement.",
  },
  {
    id: "s05-no-car-far-good-option",
    title: "Same pair, but no car",
    probe: "The mirror of s04 — unreachable beats well-matched.",
    need: need({ transport: "walking", diet: "halal" }),
    resources: [
      res({ id: "a", name: "Nearby Pantry", distanceMiles: 0.7, hours: "3pm - 7pm", foodTypes: ["groceries", "halal"], walkIn: true }),
      res({ id: "b", name: "Masjid Community Meal", distanceMiles: 6.5, hours: "5pm - 9pm", foodTypes: ["hot meals", "halal"], walkIn: true }),
    ],
    expectedTopId: "a",
    label: "6.5 miles on foot is not reachable tonight; A also offers halal.",
  },
  {
    id: "s06-closing-too-soon",
    title: "Open, but closing in 20 minutes",
    probe: "Is a closing-soon window discounted against a comfortable one?",
    need: need({ transport: "walking" }),
    resources: [
      res({ id: "a", name: "Last Call Pantry", distanceMiles: 1.0, hours: "1pm - 6:20pm", walkIn: true }),
      res({ id: "b", name: "Late Kitchen", distanceMiles: 1.3, hours: "5pm - 9pm", walkIn: true }),
    ],
    expectedTopId: "b",
    label: "A mile on foot takes longer than the 20 minutes A has left.",
  },
  {
    id: "s07-student-id-required",
    title: "Non-student sent to a campus pantry",
    probe: "Is an eligibility rule the person fails treated as blocking?",
    need: need({ notes: "Not a student" }),
    resources: [
      res({ id: "a", name: "Campus Pantry", distanceMiles: 0.4, hours: "10am - 7pm", walkIn: true, eligibility: "Enrolled students only, student ID required" }),
      res({ id: "b", name: "Neighborhood Meal", distanceMiles: 1.4, hours: "5pm - 8pm", walkIn: true, eligibility: "Open to all, no ID" }),
    ],
    expectedTopId: "b",
    label: "The person is not enrolled, so A would turn them away.",
  },
  {
    id: "s08-unverified-vs-verified",
    title: "Verified nearby vs. unverified nearer",
    probe: "Does low research confidence cost a resource the top slot?",
    need: need(),
    resources: [
      res({ id: "a", name: "Rumoured Fridge", distanceMiles: 0.6, hours: "", confidence: 0.2, verified: false, gaps: ["hours", "walkIn"] }),
      res({ id: "b", name: "Confirmed Kitchen", distanceMiles: 1.0, hours: "4pm - 8pm", walkIn: true, confidence: 0.95 }),
    ],
    expectedTopId: "b",
    label: "Sending someone to an unverified address on an empty stomach is the worse error.",
  },
  {
    id: "s09-open-conflict",
    title: "Unresolved conflict about access",
    probe: "Is an open contradiction penalised versus a clean record?",
    need: need(),
    resources: [
      res({
        id: "a",
        name: "Disputed Pantry",
        distanceMiles: 0.8,
        hours: "3pm - 8pm",
        walkIn: true,
        conflicts: [
          { field: "walkIn", claimA: "Walk-ins accepted", claimB: "Appointment required", status: "open" },
        ],
        confidence: 0.5,
      }),
      res({ id: "b", name: "Steady Meals", distanceMiles: 1.1, hours: "4pm - 8pm", walkIn: true, confidence: 0.9 }),
    ],
    expectedTopId: "b",
    label: "B is nearly as close and carries no risk of being turned away.",
  },
  {
    id: "s10-vegan-strict",
    title: "Vegan requirement, mixed boxes elsewhere",
    probe: "Is 'not guaranteed' treated as not meeting a strict requirement?",
    need: need({ diet: "vegan" }),
    resources: [
      res({ id: "a", name: "Plant Plate Kitchen", distanceMiles: 1.6, hours: "5pm - 8:30pm", foodTypes: ["hot meals", "vegan"], walkIn: true }),
      res({ id: "b", name: "Mixed Grocery Box", distanceMiles: 0.5, hours: "9am - 8pm", foodTypes: ["groceries"], walkIn: true }),
    ],
    expectedTopId: "a",
    label: "Only A guarantees vegan food; a mixed box may contain nothing edible for them.",
  },
  {
    id: "s11-transit-middle-distance",
    title: "Bus available, mid-distance best fit",
    probe: "Does transit correctly sit between walking and driving?",
    need: need({ transport: "transit", diet: "vegetarian" }),
    resources: [
      res({ id: "a", name: "Transit Line Kitchen", distanceMiles: 3.2, hours: "4pm - 9pm", foodTypes: ["vegetarian", "hot meals"], walkIn: true }),
      res({ id: "b", name: "Corner Store Pantry", distanceMiles: 0.6, hours: "9am - 6:15pm", foodTypes: ["canned goods"], walkIn: true }),
    ],
    expectedTopId: "a",
    label: "3.2 miles is a short bus ride, and B closes in minutes with no vegetarian option.",
  },
  {
    id: "s12-tie-break-on-hours",
    title: "Two near-identical options",
    probe: "Does a longer open window break an otherwise even tie?",
    need: need(),
    resources: [
      res({ id: "a", name: "North Meals", distanceMiles: 1.0, hours: "5pm - 6:45pm", walkIn: true }),
      res({ id: "b", name: "South Meals", distanceMiles: 1.0, hours: "5pm - 8:30pm", walkIn: true }),
    ],
    expectedTopId: "b",
    label: "Identical except B gives the person nearly two more hours.",
  },
  {
    id: "s13-this-week-flexibility",
    title: "Not urgent — best programme wins",
    probe: "When timing is loose, does quality of fit take over?",
    need: need({ urgency: "this-week", transport: "walking", diet: "any" }),
    resources: [
      res({ id: "a", name: "Weekly Grocery Program", distanceMiles: 1.2, hours: "Saturdays 9am - 1pm", foodTypes: ["groceries", "produce"], walkIn: true, eligibility: "Open to all" }),
      res({ id: "b", name: "Tonight Only Soup Line", distanceMiles: 1.1, hours: "6pm - 7pm", foodTypes: ["soup"], walkIn: true }),
    ],
    expectedTopId: "a",
    label: "With a week of flexibility, a full grocery pickup beats one bowl of soup.",
  },
  {
    id: "s14-gluten-free",
    title: "Coeliac, needs certainty",
    probe: "Is an explicit gluten-free provision preferred over proximity?",
    need: need({ diet: "gluten-free" }),
    resources: [
      res({ id: "a", name: "Bread Line", distanceMiles: 0.3, hours: "4pm - 8pm", foodTypes: ["bread", "pasta"], walkIn: true }),
      res({ id: "b", name: "Allergy Aware Pantry", distanceMiles: 1.4, hours: "3pm - 7:30pm", foodTypes: ["gluten-free", "groceries"], walkIn: true }),
    ],
    expectedTopId: "b",
    label: "A's stock is exactly what they cannot eat.",
  },
  {
    id: "s15-all-poor-least-bad",
    title: "Every option is flawed",
    probe: "Can it pick the least-bad option instead of refusing?",
    need: need({ transport: "walking", diet: "vegetarian" }),
    resources: [
      res({ id: "a", name: "Far Vegetarian Kitchen", distanceMiles: 4.5, hours: "5pm - 9pm", foodTypes: ["vegetarian"], walkIn: true }),
      res({ id: "b", name: "Near Closed Pantry", distanceMiles: 0.4, hours: "9am - 4pm", foodTypes: ["vegetarian"], walkIn: true }),
      res({ id: "c", name: "Near Appointment Pantry", distanceMiles: 0.7, hours: "4pm - 8pm", foodTypes: ["vegetarian"], walkIn: false }),
    ],
    expectedTopId: "c",
    label: "C is open, close and vegetarian; the appointment rule is the only barrier and is worth a phone call.",
  },
  {
    id: "s16-bike-range",
    title: "Bike widens the range",
    probe: "Does a bike unlock a 3-mile option a walker could not reach?",
    need: need({ transport: "bike", diet: "vegetarian" }),
    resources: [
      res({ id: "a", name: "Crosstown Veg Kitchen", distanceMiles: 3.0, hours: "5pm - 9pm", foodTypes: ["vegetarian", "hot meals"], walkIn: true }),
      res({ id: "b", name: "Local Canned Goods", distanceMiles: 0.5, hours: "10am - 7pm", foodTypes: ["canned goods"], walkIn: true }),
    ],
    expectedTopId: "a",
    label: "Three miles is a 15-minute ride, and only A actually feeds them tonight.",
  },
  {
    id: "s17-hours-unknown",
    title: "Unknown hours vs. known hours",
    probe: "Is a documented open window preferred over an unknown one?",
    need: need(),
    resources: [
      res({ id: "a", name: "Unlisted Hours Pantry", distanceMiles: 0.5, hours: "", walkIn: true, confidence: 0.4, gaps: ["hours"] }),
      res({ id: "b", name: "Published Hours Kitchen", distanceMiles: 1.2, hours: "4:30pm - 8pm", walkIn: true, confidence: 0.9 }),
    ],
    expectedTopId: "b",
    label: "A half-mile walk to a locked door is worse than a mile to an open one.",
  },
  {
    id: "s18-two-people-note",
    title: "Free-text note changes the answer",
    probe: "Are the person's own words used, not just the structured fields?",
    need: need({ notes: "I have my two kids with me and no ID" }),
    resources: [
      res({ id: "a", name: "Single Adult Meal", distanceMiles: 0.6, hours: "5pm - 8pm", walkIn: true, eligibility: "Adults only, photo ID required at entry" }),
      res({ id: "b", name: "Family Dinner Program", distanceMiles: 1.3, hours: "5pm - 8pm", walkIn: true, eligibility: "Families welcome, no ID needed" }),
    ],
    expectedTopId: "b",
    label: "A would refuse them twice over — children and no ID.",
  },
  {
    id: "s19-kosher",
    title: "Kosher requirement",
    probe: "Is a named religious dietary requirement honoured?",
    need: need({ diet: "kosher", transport: "transit" }),
    resources: [
      res({ id: "a", name: "General Soup Kitchen", distanceMiles: 0.8, hours: "5pm - 8pm", foodTypes: ["hot meals"], walkIn: true }),
      res({ id: "b", name: "Kosher Food Pantry", distanceMiles: 2.6, hours: "4pm - 7:30pm", foodTypes: ["kosher", "groceries"], walkIn: true }),
    ],
    expectedTopId: "b",
    label: "Only B is kosher and it is within transit range.",
  },
  {
    id: "s20-24h-fridge",
    title: "Late night, everything closed but one",
    probe: "Is a 24-hour resource recognised as the only live option?",
    need: need({ notes: "It is late and I have nothing" }),
    resources: [
      res({ id: "a", name: "Community Fridge", distanceMiles: 1.1, hours: "24 hours", foodTypes: ["groceries", "produce"], walkIn: true, eligibility: "Take what you need" }),
      res({ id: "b", name: "Daytime Pantry", distanceMiles: 0.4, hours: "9am - 5pm", walkIn: true }),
      res({ id: "c", name: "Evening Meal", distanceMiles: 0.9, hours: "5pm - 6pm", walkIn: true }),
    ],
    expectedTopId: "a",
    label: "The fridge is the only thing still accessible, and it needs no staff.",
  },
];
