import { expect, test } from "vitest";
import { knownOrSafe, mergeAttendance } from "./attendance";

test("an addition is added", () => {
  expect(mergeAttendance(["a", "b"], ["a", "b"], ["a", "b", "c"])).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("a removal is removed", () => {
  expect(mergeAttendance(["a", "b"], ["a", "b"], ["a"])).toEqual(["a"]);
});

/* the whole reason this file exists: two laptops each holding [a, b], each
   adding one person. before the merge, whoever wrote second deleted the other */
test("a second device's addition survives this device's write", () => {
  const current = ["a", "b", "d"]; // the other laptop already added d
  const known = ["a", "b"]; // this laptop never saw d
  const wanted = ["a", "b", "c"]; // and is adding c

  expect(mergeAttendance(current, known, wanted)).toEqual(["a", "b", "d", "c"]);
});

test("a removal still applies even when the other device has been busy", () => {
  expect(mergeAttendance(["a", "b", "d"], ["a", "b"], ["a"])).toEqual([
    "a",
    "d",
  ]);
});

/* a device can only remove what it knew about. it cannot delete somebody it
   never saw, because to it that person is indistinguishable from a stranger */
test("a person this device never knew is never removed", () => {
  expect(mergeAttendance(["a", "z"], ["a"], ["a"])).toEqual(["a", "z"]);
});

test("clearing the list this device knows about leaves the rest alone", () => {
  expect(mergeAttendance(["a", "b", "z"], ["a", "b"], [])).toEqual(["z"]);
});

test("re-adding somebody the other device just removed keeps them", () => {
  expect(mergeAttendance(["a"], ["a"], ["a", "b"])).toEqual(["a", "b"]);
});

test("a duplicate in any input lands once", () => {
  expect(mergeAttendance(["a", "a"], ["a"], ["a", "b", "b"])).toEqual([
    "a",
    "b",
  ]);
});

test("nothing changes when nothing changed", () => {
  expect(mergeAttendance(["a", "b"], ["a", "b"], ["a", "b"])).toEqual([
    "a",
    "b",
  ]);
});

test("an empty meeting takes the first arrival", () => {
  expect(mergeAttendance([], [], ["a"])).toEqual(["a"]);
});

test("a caller that says nothing about what it knew adds and never removes", () => {
  const known = knownOrSafe(undefined);

  expect(known).toEqual([]);
  /* every name it sent is an addition, and `z`, who it never mentioned,
     survives. defaulting `known` to `wanted` instead would make both the
     additions and the removals empty, so the write would be a no-op and the
     person who just tapped would be silently lost */
  expect(mergeAttendance(["a", "z"], known, ["a", "b"])).toEqual([
    "a",
    "z",
    "b",
  ]);
});

test("a caller that does say what it knew keeps its removals", () => {
  expect(knownOrSafe(["a", "b"])).toEqual(["a", "b"]);
});
