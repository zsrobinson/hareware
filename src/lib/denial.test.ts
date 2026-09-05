import { expect, test } from "vitest";
import { DENIALS, type Denial } from "./denial";

/*
  The guard reads the table's status and the refusal page reads its copy, so a
  row missing a field is a refusal that renders blank rather than one that
  fails to compile.
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

/* A refusal that says "you are signed in as" and then does not say who. */
test("the refusals about an account name it", () => {
  expect(DENIALS["no-role"].body("@zach")).toContain("@zach");
  expect(DENIALS["not-in-server"].body("@zach")).toContain("@zach");
});

/* Under a 200, a crawler and a monitor would read the refusal as the page
   working. */
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

/* A refusal with nothing to do about it is a dead end. */
test("every denial offers an action", () => {
  expect(DENIALS["signed-out"].action).toBe("sign-in");
  expect(DENIALS.unreachable.action).toBe("retry");
  /* the wrong account is the one they can fix themselves */
  expect(DENIALS["not-in-server"].action).toBe("switch-account");
  /* the right account without the role cannot: only an editor can grant it,
     so the honest offer is the way back to what they can use */
  expect(DENIALS["no-role"].action).toBe("leave");
});
