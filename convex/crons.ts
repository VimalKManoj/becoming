import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Evening reminders: checks every 15 minutes who has just reached their chosen time.
crons.cron("evening reminders", "*/15 * * * *", internal.reminders.sendDue, {});

export default crons;
