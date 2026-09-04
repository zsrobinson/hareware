import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { easternNow } from "~/lib/eastern";
import { sendMeetingReminder } from "./meeting";
import { sendSocialPing } from "./social";

/*
  not a test so much as a way to fire the reminders by hand while working on
  what they say. `npm run reminders:send` runs this and nothing else; `npm test`
  never does, because this posts real messages into whichever channel the
  webhooks in .dev.vars point at.

  point those at a private channel while iterating. set REMINDERS_DRY_RUN in
  .dev.vars to print the payloads instead of sending them
*/

const DEV_VARS = ".dev.vars";

function readEnv(): Env {
  const parsed = readFileSync(DEV_VARS, "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const split = line.indexOf("=");
      return [
        line.slice(0, split).trim(),
        line
          .slice(split + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ] as const;
    });

  /*
    the shell wins over the file, so a value can be turned off for one run
    without editing .dev.vars — `REMINDERS_DRY_RUN= npm run reminders:send`
    sends for real even while the file asks for a preview
  */
  const overrides = Object.entries(process.env).filter(
    ([key, value]) => key in Object.fromEntries(parsed) && value !== undefined,
  );

  return Object.fromEntries([...parsed, ...overrides]) as unknown as Env;
}

test.skipIf(!existsSync(DEV_VARS))(
  "send both reminders for today",
  async () => {
    const env = readEnv();
    const now = easternNow(new Date());

    console.log("eastern now:", JSON.stringify(now));
    console.log("meeting:", await sendMeetingReminder(env, now));
    console.log("social :", await sendSocialPing(env, now));
  },
);
