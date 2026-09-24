import { expect, test } from "vitest";
import {
  applyIntent,
  applyIntents,
  mergeAttendance,
  stableOrder,
} from "./attendance";

test("a removal is removed", () => {
  expect(mergeAttendance(["a", "b"], ["a", "b"], ["a"])).toEqual(["a"]);
});

/* two laptops each holding [a, b] add one person apiece */
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

/* the kiosk draws newest first, so arrivals must land last */
test("insertion order survives the merge, with arrivals last", () => {
  expect(mergeAttendance(["a", "b"], ["a", "b"], ["a", "b", "c"])).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("another device's arrivals land after ours, not shuffled through them", () => {
  const merged = mergeAttendance(["a", "b", "z"], ["a", "b"], ["a", "b", "c"]);

  expect(merged).toEqual(["a", "b", "z", "c"]);
  /* which is what the kiosk draws, newest first */
  expect([...merged].reverse()).toEqual(["c", "z", "b", "a"]);
});

test("a removal does not reorder what is left", () => {
  expect(mergeAttendance(["a", "b", "c"], ["a", "b", "c"], ["a", "c"])).toEqual(
    ["a", "c"],
  );
});

test("an add appends, and a second add of the same person changes nothing", () => {
  expect(applyIntent(["a"], { kind: "add", pageId: "b" })).toEqual(["a", "b"]);
  expect(applyIntent(["a", "b"], { kind: "add", pageId: "b" })).toEqual([
    "a",
    "b",
  ]);
});

test("a remove takes one out and leaves the order alone", () => {
  expect(applyIntent(["a", "b", "c"], { kind: "remove", pageId: "b" })).toEqual(
    ["a", "c"],
  );
  expect(applyIntent(["a"], { kind: "remove", pageId: "z" })).toEqual(["a"]);
});

/* two taps while the first write is in flight */
test("intents queued against the same list both survive", () => {
  const first = applyIntents(["a"], [{ kind: "add", pageId: "b" }]);
  const both = applyIntents(first, [{ kind: "add", pageId: "c" }]);

  expect(both).toEqual(["a", "b", "c"]);
});

/* the tap being written is in both notion's answer and the queue */
test("an intent already reflected in the answer draws the same", () => {
  expect(applyIntents(["a", "b"], [{ kind: "add", pageId: "b" }])).toEqual([
    "a",
    "b",
  ]);
});

test("a remove queued behind an add of the same person wins", () => {
  expect(
    applyIntents(
      ["a"],
      [
        { kind: "add", pageId: "b" },
        { kind: "remove", pageId: "b" },
      ],
    ),
  ).toEqual(["a"]);
});

test("an order already drawn is kept, and arrivals go on the end", () => {
  expect(stableOrder(["a", "b"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
});

/* notion does not keep a relation's order */
test("a reshuffled answer does not reorder the screen", () => {
  expect(stableOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("somebody no longer in the list is dropped", () => {
  expect(stableOrder(["a", "b", "c"], ["a", "c"])).toEqual(["a", "c"]);
});

test("somebody another device signed in lands at the end, once", () => {
  expect(stableOrder(["a"], ["z", "a", "y"])).toEqual(["a", "z", "y"]);
});

test("drawing the same list again never moves it", () => {
  const once = stableOrder(["a", "b"], ["b", "a"]);

  expect(stableOrder(once, ["b", "a"])).toEqual(once);
});

test("a first draw takes the order it is given", () => {
  expect(stableOrder([], ["a", "b"])).toEqual(["a", "b"]);
});
