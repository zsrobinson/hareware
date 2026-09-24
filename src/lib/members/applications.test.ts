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

/* what was typed is in `response`; `values` is `[""]` for a free-text field */
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

/* the club's own labels, from the live form on 2026-09-08 */
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

/* a question reworded past its keyword reads as unanswered, never as a wrong value */
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

test("the applied day is the Eastern day", async () => {
  /* 9pm Eastern on the 3rd, already the 4th in UTC */
  const application = await read({
    id: "1",
    user_id: "u1",
    created_at: "2026-09-04T01:00:00.000Z",
  });

  expect(application.applied).toBe("2026-09-03");
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
