import { expect, test } from "vitest";
import { toOriginalImage, toSizedImage } from "./image-url";

test("the original drops photon's host and its resizing", () => {
  expect(
    toOriginalImage(
      "https://i0.wp.com/theumdhare.com/wp-content/uploads/2026/09/main-earth.jpg?w=960&quality=80",
    ),
  ).toBe("https://theumdhare.com/wp-content/uploads/2026/09/main-earth.jpg");
  expect(
    toOriginalImage(
      "https://theumdhare.com/wp-content/uploads/2026/09/a.png?resize=10",
    ),
  ).toBe("https://theumdhare.com/wp-content/uploads/2026/09/a.png");
});

test("a sized image asks photon for that width, whatever it carried", () => {
  expect(toSizedImage("https://i0.wp.com/theumdhare.com/a.jpg?w=10", 960)).toBe(
    "https://i0.wp.com/theumdhare.com/a.jpg?w=960&quality=80",
  );
});
