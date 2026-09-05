import { expect, test } from "vitest";
import { DENIALS, type Denial } from "./denial";

/*
  the table is the only list of denials there is — the guard reads its status,
  the refusal page reads its copy and its action. these are about the table
  staying whole, because a row missing a field is a refusal that renders blank
  rather than one that fails to compile
*/

const ALL: Denial[] = ["signed-out", "no-role", "not-in-server", "unreachable"];

test("every denial has a row", () => {
  expect(Object.keys(DENIALS).sort()).toEqual([...ALL].sort());
});

test("every row says something, and says who to", () => {
  for (const denial of ALL) {
    const row = DENIALS[denial];

    expect(row.title.length).toBeGreaterThan(0);
    expect(row.body("@zach").length).toBeGreaterThan(0);
  }
});

/*
  the two that name the member have to actually use the name. this is the fault
  the whole change is about, in miniature: a refusal that says "you are signed
  in as" and then does not say who
*/
test("the refusals about an account name it", () => {
  expect(DENIALS["no-role"].body("@zach")).toContain("@zach");
  expect(DENIALS["not-in-server"].body("@zach")).toContain("@zach");
});

/*
  a status that is not a refusal would render the refusal page under a 200, so
  a crawler, a monitor and `curl -i` would all read it as the page working
*/
test("every denial carries a status that means refused", () => {
  for (const denial of ALL) {
    expect(DENIALS[denial].status).toBeGreaterThanOrEqual(400);
  }
});

test("the statuses are the ones each situation deserves", () => {
  expect(DENIALS["signed-out"].status).toBe(401);
  expect(DENIALS["no-role"].status).toBe(403);
  expect(DENIALS["not-in-server"].status).toBe(403);
  /* an outage is ours, not theirs, and 503 is what says come back */
  expect(DENIALS.unreachable.status).toBe(503);
});

/*
  a refusal with nothing to do about it is a dead end. the one that is our
  fault offers a retry; the rest offer a way in
*/
test("every denial offers an action", () => {
  expect(DENIALS["signed-out"].action).toBe("sign-in");
  expect(DENIALS.unreachable.action).toBe("retry");
  expect(DENIALS["no-role"].action).toBe("switch-account");
  expect(DENIALS["not-in-server"].action).toBe("switch-account");
});
