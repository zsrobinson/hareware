import { expect, test, vi } from "vitest";
import type { Profile } from "./member";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { faces } = await import("./faces");

const profile = (displayName: string): Profile => ({
  displayName,
  username: displayName,
  avatarUrl: `https://cdn.discordapp.com/avatars/${displayName}.png`,
});

const guild = async () => new Map([["1", profile("zach")]]);

test("a member is drawn with the url the guild read resolved", async () => {
  expect(await faces(["1"], guild)).toEqual({
    "1": {
      displayName: "zach",
      username: "zach",
      avatarUrl: "https://cdn.discordapp.com/avatars/zach.png",
    },
  });
});

test("an id the guild does not know is left out, so the row draws a ghost", async () => {
  expect(await faces(["2"], guild)).toEqual({});
});

/* a missing token and a refused request both answer with an empty guild, and
   a page of names is still a page */
test("an empty guild leaves everybody a ghost", async () => {
  expect(await faces(["1", "2"], async () => new Map())).toEqual({});
});

test("rows with no discord id never reach discord", async () => {
  const load = vi.fn();

  expect(await faces([null, undefined, ""], load)).toEqual({});
  expect(load).not.toHaveBeenCalled();
});

test("one guild read however many rows are drawn", async () => {
  const load = vi.fn(guild);

  await faces(["1", "1", "2", "3"], load);

  expect(load).toHaveBeenCalledTimes(1);
});
