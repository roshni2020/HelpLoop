import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { TICK_SECONDS } from "./bots";

// The simulated volunteers' heartbeat. `tick` returns immediately when
// there are no bots, so an idle deployment costs almost nothing.
const crons = cronJobs();
crons.interval("simulated volunteers", { seconds: TICK_SECONDS }, internal.bots.tick, {});
export default crons;
