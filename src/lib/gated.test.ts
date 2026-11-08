import { afterEach, expect, test, vi } from "vitest";
import { failureOf, fetchGated, Refused } from "./gated";

afterEach(() => {
  vi.unstubAllGlobals();
});

const answering = (response: Response) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

/* the client half of the gate: a refusal misread as an error would show the
   raw JSON, or worse, nothing to act on */
test("a refusal is read as the refusal it names", async () => {
  answering(
    Response.json({ denial: "no-role", you: "Testudo" }, { status: 403 }),
  );
  const thrown = await fetchGated("/api/archive.json").catch((e) => e);

  expect(thrown).toBeInstanceOf(Refused);
  expect((thrown as Refused).body).toEqual({
    denial: "no-role",
    you: "Testudo",
  });
});

test("an answer that is not a refusal is an error worded for a person", async () => {
  const of = (body: string, status: number) =>
    failureOf(new Response(body, { status })).then((e) => [
      e instanceof Refused,
      e.message,
    ]);

  expect(await of('{"denial":"made-up"}', 403)).toEqual([
    false,
    '{"denial":"made-up"}',
  ]);
  expect(await of("could not read the Sheet: timeout", 502)).toEqual([
    false,
    "could not read the Sheet: timeout",
  ]);
  expect(await of("<!doctype html><title>1102</title>", 503)).toEqual([
    false,
    "HareWare answered 503",
  ]);
  expect(await of("", 500)).toEqual([false, "HareWare answered 500"]);
});

test("an answer with no body is null", async () => {
  answering(new Response(null, { status: 204 }));
  expect(await fetchGated("/api/access.json")).toBeNull();
});
