import { afterEach, expect, test, vi } from "vitest";
import { approvedApplications } from "./applications";

afterEach(() => vi.unstubAllGlobals());

/** one join request as discord's endpoint answers it, read as an application */
async function read(raw: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ guild_join_requests: [raw] })),
    ),
  );

  return (await approvedApplications("token"))[0]!;
}

/*
  the trap that cost an afternoon. every entry carries both `values` and
  `response`: `values` echoes the question's configured options — for a
  free-text field, an array holding one empty string — while `response` holds
  what the applicant typed. Reading `values` produces a complete-looking result
  in which every answer is blank, and nothing about it looks wrong
*/
test("an answer is read from `response`, never from the `values` decoy", async () => {
  const application = await read({
    id: "1545474779111497810",
    created_at: "2026-09-04T18:22:00.000Z",
    user_id: "574376763006648349",
    user: { username: "bayh", global_name: "Bay" },
    form_responses: [
      {
        field_type: "TEXT_INPUT",
        label: "What's your full name?",
        values: [""],
        response: "Bay Hoffman",
      },
      {
        field_type: "TEXT_INPUT",
        label: "What's your email?",
        values: [""],
        response: "bay@terpmail.umd.edu",
      },
    ],
  });

  expect(application.name).toBe("Bay Hoffman");
  expect(application.email).toBe("bay@terpmail.umd.edu");
});

/*
  matched on the label rather than on position: a question added in the middle
  of the form would shift every index by one and move everybody's email into
  their name.

  the labels here are the club's own, read from the live form on 2026-09-08, so
  this test fails if somebody rewords a question past the keyword it is found by
*/
test("fields are found by what the question asks, not by their order", async () => {
  const application = await read({
    id: "1",
    user_id: "u1",
    form_responses: [
      {
        label: "What year will your graduate? (specify if not an undergrad)",
        response: "2028",
      },
      {
        label: "What's your email? (terpmail preferred)",
        response: "bay@umd.edu",
      },
      { label: "What's your full name?", response: "Bay Hoffman" },
    ],
  });

  expect(application.name).toBe("Bay Hoffman");
  expect(application.email).toBe("bay@umd.edu");
  expect(application.gradYear).toBe("2028");
});

/*
  the accepted cost of matching on a keyword, pinned so it is a decision rather
  than a surprise: a question reworded past its keyword reads as unanswered.
  That surfaces on the reconciler as an application missing a field, which is
  the safe direction — the wrong value written into Notion is the other one
*/
test("a question reworded past its keyword reads as unanswered", async () => {
  const application = await read({
    id: "1",
    user_id: "u1",
    form_responses: [{ label: "When do you graduate?", response: "2028" }],
  });

  expect(application.gradYear).toBeNull();
});

test("a question that was not answered reads as null, not as an empty string", async () => {
  const application = await read({
    id: "1",
    user_id: "u1",
    form_responses: [{ label: "What's your email?", response: "   " }],
  });

  expect(application.email).toBeNull();
  expect(application.name).toBeNull();
});

/* the rules checkbox is a response like any other, and its label mentions
   nothing we look for — but excluding it keeps the keyword search honest */
test("the terms checkbox is not treated as an answer", async () => {
  const application = await read({
    id: "1",
    user_id: "u1",
    form_responses: [
      {
        field_type: "TERMS",
        label: "Read and agree to the server rules, including your name",
        response: "true",
      },
      { label: "Full name", response: "Bay Hoffman" },
    ],
  });

  expect(application.name).toBe("Bay Hoffman");
});

test("somebody who answered nothing is still named by their account", async () => {
  const withGlobal = await read({
    id: "1",
    user_id: "u1",
    user: { username: "bayh", global_name: "Bay" },
  });
  const withoutGlobal = await read({
    id: "2",
    user_id: "u2",
    user: { username: "bayh" },
  });
  const withoutUser = await read({ id: "3", user_id: "u3" });

  expect(withGlobal.username).toBe("Bay");
  expect(withoutGlobal.username).toBe("bayh");
  expect(withoutUser.username).toBe("u3");
});

test("the applied day is the date alone", async () => {
  const application = await read({
    id: "1",
    user_id: "u1",
    created_at: "2026-09-04T18:22:00.000Z",
  });

  expect(application.applied).toBe("2026-09-04");
});

test("an application with no creation time has no applied day, not an empty one", async () => {
  expect((await read({ id: "1", user_id: "u1" })).applied).toBeNull();
});

test("no token is refused before discord is asked", async () => {
  const fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);

  await expect(approvedApplications(undefined)).rejects.toThrow(
    /DISCORD_BOT_TOKEN/,
  );
  expect(fetched).not.toHaveBeenCalled();
});
