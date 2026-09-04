import { describe, expect, test } from "vitest";
import { easternNow, easternTime } from "./eastern";

describe("easternNow", () => {
  test("resolves the eastern day, hour and weekday from a utc instant", () => {
    expect(easternNow(new Date("2026-09-03T12:00:00Z"))).toEqual({
      date: "2026-09-03",
      hour: 8,
      weekday: "Thursday",
    });
  });

  test("tracks the offset across daylight saving", () => {
    // 8am eastern is 12:00 utc in summer and 13:00 utc in winter
    expect(easternNow(new Date("2026-09-03T12:00:00Z")).hour).toBe(8);
    expect(easternNow(new Date("2026-01-15T13:00:00Z")).hour).toBe(8);
  });

  test("midnight is hour 0, not 24", () => {
    // en-US with hour12:false formats midnight as "24", which would never
    // equal a REMINDER_HOUR and would quietly skip that hour forever
    expect(easternNow(new Date("2026-09-03T04:00:00Z")).hour).toBe(0);
  });

  test("a late utc instant belongs to the previous eastern day", () => {
    expect(easternNow(new Date("2026-09-04T03:30:00Z")).date).toBe(
      "2026-09-03",
    );
  });

  /*
    the reminders run off an hourly cron and act on the tick whose eastern hour
    matches, so an hour that comes round twice would send everything twice.
    clocks go back at 2am on the first sunday of november and forward on the
    second sunday of march
  */
  test.each([
    ["2026-03-08", "spring forward"],
    ["2026-11-01", "fall back"],
  ])("hour 8 happens exactly once on %s (%s)", (day) => {
    const counts: Record<string, number> = {};

    for (let offset = -24; offset < 48; offset++) {
      const tick = new Date(`${day}T00:00:00Z`);
      tick.setUTCHours(tick.getUTCHours() + offset);
      const { date, hour } = easternNow(tick);
      if (hour === 8) counts[date] = (counts[date] ?? 0) + 1;
    }

    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
  });

  test("hour 1 is NOT safe, which is why REMINDER_HOUR must avoid it", () => {
    let onFallBackDay = 0;
    for (let hour = 0; hour < 48; hour++) {
      const tick = new Date("2026-11-01T00:00:00Z");
      tick.setUTCHours(hour);
      const { date, hour: eastern } = easternNow(tick);
      if (eastern === 1 && date === "2026-11-01") onFallBackDay++;
    }
    expect(onFallBackDay).toBe(2);
  });
});

describe("easternTime", () => {
  test("formats an instant as a short eastern clock time", () => {
    expect(easternTime("2026-04-14T20:00:00.000-04:00")).toBe("8pm");
    expect(easternTime("2026-04-14T19:30:00.000-04:00")).toBe("7:30pm");
  });

  test("a date with no time is a calendar day and has no clock time", () => {
    expect(easternTime("2026-09-08")).toBeUndefined();
  });
});
