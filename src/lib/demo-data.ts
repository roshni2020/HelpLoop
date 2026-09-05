// ─────────────────────────────────────────────────────────────
// Demo backend.
//
// Used when LINKUP_API_KEY is absent. Every organization below is
// FICTIONAL and is labelled as such everywhere it is shown, so nobody
// is ever sent to an address that does not serve food. It exists so the
// full research -> gap -> follow-up -> conflict -> rank flow can be
// demonstrated on a bad conference wifi connection.
// ─────────────────────────────────────────────────────────────

import type { HelpNeed } from "./types";
import type { RawResource } from "./linkup";

export interface DemoResource extends RawResource {
  /** Scripted answers the "follow-up search" returns, keyed by gap field. */
  followUps: Record<string, { answer: string; sources: string[] }>;
  offsetMiles: number;
  bearing: number;
}

export const DEMO_NOTICE =
  "Demo data - fictional organizations. Add LINKUP_API_KEY to research real resources.";

export const DEMO_RESOURCES: DemoResource[] = [
  {
    name: "Eastside Community Kitchen",
    address: "1420 Foothill Blvd",
    // Deliberately vague: this is the gap the pipeline detects and fills.
    hours: "Open most evenings",
    eligibility: "",
    foodTypes: ["hot meals", "vegetarian"],
    // Left blank on purpose: the seed search doesn't say, so the pipeline
    // asks — and the answer it gets back is self-contradictory.
    walkIn: "",
    phone: "(510) 555-0142",
    website: "https://example.org/eastside-community-kitchen",
    offsetMiles: 1.2,
    bearing: 42,
    followUps: {
      hours: {
        answer:
          "Eastside Community Kitchen serves dinner Monday through Saturday from 4:00 PM and closes at 8:00 PM. Last plate is served 15 minutes before closing.",
        sources: [
          "https://example.org/eastside-community-kitchen/hours",
          "https://example.org/city-meal-directory",
        ],
      },
      // The second source contradicts the first: an appointment is claimed.
      walkIn: {
        answer:
          "The dinner service page states that an appointment is required for the grocery program. Separately, the city meal directory lists Eastside Community Kitchen as accepting walk-ins for the hot dinner service.",
        sources: [
          "https://example.org/eastside-community-kitchen/programs",
          "https://example.org/city-meal-directory",
        ],
      },
      "walkIn:resolve": {
        answer:
          "Confirmed by the kitchen's own FAQ: walk-ins are welcome for the hot evening meal with no appointment. The appointment requirement applies only to the separate weekly grocery box pickup.",
        sources: ["https://example.org/eastside-community-kitchen/faq"],
      },
      eligibility: {
        answer:
          "No ID, referral or proof of address is required for the evening meal. Open to anyone who comes to the door.",
        sources: ["https://example.org/eastside-community-kitchen/faq"],
      },
      diet: {
        answer:
          "A vegetarian entree is offered at every dinner service, and a vegan option is available on request.",
        sources: ["https://example.org/eastside-community-kitchen/menu"],
      },
    },
  },
  {
    name: "Campus Student Pantry",
    address: "2100 University Ave",
    hours: "Mon-Fri 10am - 5pm",
    eligibility: "Currently enrolled students, student ID required",
    foodTypes: ["groceries", "vegetarian", "shelf-stable"],
    walkIn: "yes",
    phone: "(510) 555-0177",
    website: "https://example.edu/student-pantry",
    offsetMiles: 0.5,
    bearing: 310,
    followUps: {
      diet: {
        answer:
          "The pantry stocks a dedicated vegetarian and vegan shelf, including plant-based proteins and produce.",
        sources: ["https://example.edu/student-pantry/what-we-stock"],
      },
      eligibility: {
        answer:
          "A current student ID is required at check-in. The pantry cannot serve community members who are not enrolled.",
        sources: ["https://example.edu/student-pantry/eligibility"],
      },
    },
  },
  {
    name: "Riverbend Regional Food Bank",
    address: "8800 Industrial Pkwy",
    hours: "Daily 9am - 9pm",
    eligibility: "Open to all households, no documentation required",
    foodTypes: ["groceries", "produce", "canned goods"],
    walkIn: "yes",
    phone: "(510) 555-0198",
    website: "https://example.org/riverbend-food-bank",
    offsetMiles: 3.4,
    bearing: 155,
    followUps: {
      diet: {
        answer:
          "Riverbend distributes mixed grocery boxes. Vegetarian substitutions are not guaranteed and depend on that day's donations.",
        sources: ["https://example.org/riverbend-food-bank/boxes"],
      },
    },
  },
  {
    name: "St. Anne's Evening Meal Program",
    address: "615 Grand Ave",
    hours: "",
    eligibility: "",
    foodTypes: ["hot meals", "halal", "vegetarian"],
    walkIn: "",
    phone: "(510) 555-0113",
    website: "https://example.org/st-annes-meals",
    offsetMiles: 0.9,
    bearing: 200,
    followUps: {
      hours: {
        answer:
          "St. Anne's serves an evening meal Tuesday, Thursday and Sunday from 5:30 PM until 7:30 PM.",
        sources: ["https://example.org/st-annes-meals/schedule"],
      },
      walkIn: {
        answer:
          "Walk-ins are welcome. No appointment, referral or registration is needed to eat.",
        sources: ["https://example.org/st-annes-meals/schedule"],
      },
      eligibility: {
        answer: "Open to anyone in need. No ID and no proof of residency.",
        sources: ["https://example.org/st-annes-meals/about"],
      },
      diet: {
        answer:
          "Every service includes a vegetarian plate, and halal meat is used for the main entree.",
        sources: ["https://example.org/st-annes-meals/menu"],
      },
    },
  },
  {
    name: "Northgate Mutual Aid Fridge",
    address: "Corner of 34th and Linden",
    hours: "24 hours",
    eligibility: "Take what you need, leave what you can",
    foodTypes: ["groceries", "produce", "vegetarian"],
    walkIn: "yes",
    website: "https://example.org/northgate-fridge",
    offsetMiles: 1.9,
    bearing: 95,
    followUps: {
      diet: {
        answer:
          "Stock is donated and varies hour to hour. Vegetarian items are common but nothing is guaranteed to be there when you arrive.",
        sources: ["https://example.org/northgate-fridge/faq"],
      },
      eligibility: {
        answer: "No requirements of any kind. The fridge is unattended and public.",
        sources: ["https://example.org/northgate-fridge"],
      },
    },
  },
];

/** A demo set shaped to the person's stated diet, so the demo stays honest. */
export function demoSeed(need: HelpNeed): DemoResource[] {
  const all = [...DEMO_RESOURCES];
  if (need.diet === "halal") {
    // Put the halal-capable program in the running; drop one that isn't.
    return all.filter((r) => r.name !== "Campus Student Pantry");
  }
  return all;
}
