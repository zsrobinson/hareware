import { afterEach, expect, test, vi } from "vitest";
import { approvedApplications, toApplication } from "./join-requests";

afterEach(() => vi.unstubAllGlobals());

/*
  the module the whole roster rests on, and until now the only one in this
  design with no tests at all. Everything here is a shape Discord actually
  answered with, including the two that read as "nobody has applied".
*/

const answer = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body))),
  );

/*
  the trap that cost an afternoon. every entry carries both `values` and
  `response`: `values` echoes the question's configured options — for a
  free-text field, an array holding one empty string — while `response` holds
  what the applicant typed. Reading `values` produces a complete-looking result
  in which every answer is blank, and nothing about it looks wrong
*/
test("an answer is read from `response`, never from the `values` decoy", () => {
  const application = toApplication({
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
test("fields are found by what the question asks, not by their order", () => {
  const application = toApplication({
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
test("a question reworded past its keyword reads as unanswered", () => {
  const application = toApplication({
    id: "1",
    user_id: "u1",
    form_responses: [{ label: "When do you graduate?", response: "2028" }],
  });

  expect(application.gradYear).toBeNull();
});

test("a question that was not answered reads as null, not as an empty string", () => {
  const application = toApplication({
    id: "1",
    user_id: "u1",
    form_responses: [{ label: "What's your email?", response: "   " }],
  });

  expect(application.email).toBeNull();
  expect(application.name).toBeNull();
});

/* the rules checkbox is a response like any other, and its label mentions
   nothing we look for — but excluding it keeps the keyword search honest */
test("the terms checkbox is not treated as an answer", () => {
  const application = toApplication({
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

test("somebody who answered nothing is still named by their account", () => {
  const withGlobal = toApplication({
    id: "1",
    user_id: "u1",
    user: { username: "bayh", global_name: "Bay" },
  });
  const withoutGlobal = toApplication({
    id: "2",
    user_id: "u2",
    user: { username: "bayh" },
  });
  const withoutUser = toApplication({ id: "3", user_id: "u3" });

  expect(withGlobal.username).toBe("Bay");
  expect(withoutGlobal.username).toBe("bayh");
  expect(withoutUser.username).toBe("u3");
});

test("the applied day is the date alone", () => {
  expect(
    toApplication({
      id: "1",
      user_id: "u1",
      created_at: "2026-09-04T18:22:00.000Z",
    }).applied,
  ).toBe("2026-09-04");
});

/*
  measured against the real guild on 2026-09-08, when the applications this
  design reads had gone: `?status=SUBMITTED` answered `{"total": 0}` and
  `?status=APPROVED` answered `{}` — no list, no count, HTTP 200.

  read as an empty list, `{}` is the sync reporting "no new applications out of
  0" every hour and the reconciler saying every applicant is already on a row,
  while the roster quietly stops growing. ADR 0007 asks for the difference
  between a run that did nothing and a run that could not try, and this is
  where that difference is decided
*/
test("an answer with neither a list nor a count is refused, not read as none", async () => {
  answer({});

  await expect(approvedApplications("token")).rejects.toThrow(
    /neither a list nor a count/,
  );
});

test("a count of zero is a real answer and means nobody", async () => {
  answer({ total: 0 });

  await expect(approvedApplications("token")).resolves.toEqual([]);
});

test("an explicit empty list is a real answer too", async () => {
  answer({ guild_join_requests: [] });

  await expect(approvedApplications("token")).resolves.toEqual([]);
});

test("a refusal names the status and keeps the token out of the message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("missing access", { status: 403 })),
  );

  await expect(approvedApplications("secret-token")).rejects.toThrow(
    /403.*missing access/s,
  );
  await expect(approvedApplications("secret-token")).rejects.not.toThrow(
    /secret-token/,
  );
});

/*
  paging uses the *smallest* id on a page rather than its last, because the
  results are not reliably ordered — and it compares snowflakes as numbers: an
  18-digit id sorts above every 19-digit one lexicographically, so text
  comparison would page from the wrong place and skip people
*/
test("paging follows the smallest snowflake, compared as a number", async () => {
  const asked: string[] = [];
  const one = (id: string) => ({ id, user_id: `u${id}` });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));

      if (asked.length === 1) {
        return new Response(
          JSON.stringify({
            guild_join_requests: [
              /* the 19-digit id is the larger number and the smaller string */
              one("1545474779111497810"),
              one("954474779111497810"),
              ...Array.from({ length: 98 }, (_, at) =>
                one(`16000000000000000${String(at).padStart(2, "0")}`),
              ),
            ],
          }),
        );
      }

      return new Response(JSON.stringify({ guild_join_requests: [] }));
    }),
  );

  await approvedApplications("token");

  expect(asked[1]).toContain("before=954474779111497810");
});

test("a page shorter than the limit is the last one", async () => {
  const fetched = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          guild_join_requests: [{ id: "1", user_id: "u1" }],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetched);

  const applications = await approvedApplications("token");

  expect(applications).toHaveLength(1);
  expect(fetched).toHaveBeenCalledTimes(1);
});
