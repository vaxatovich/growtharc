import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check Growth Arc notifications",
  { minutes: 10 },
  internal.notifications.checkAndSend
);

export default crons;
