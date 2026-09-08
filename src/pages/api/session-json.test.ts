import { beforeEach, expect, test, vi } from "vitest";

const viewer = vi.fn();

vi.mock("~/lib/admin", () => ({ viewer }));

beforeEach(() => viewer.mockReset());

test("cached navigation receives only the role decision, not Discord roles", async () => {
  viewer.mockResolvedValue({
    session: { discordUserId: "42" },
    profile: {
      displayName: "Ana Diaz",
      username: "ana",
      avatarUrl: "https://cdn.example/avatar.png",
    },
    admin: true,
    denial: null,
    roleIds: ["should-not-cross-the-wire"],
  });

  const { GET } = await import("./session.json");
  const response = await GET({
    request: new Request("https://hareware.test"),
  } as never);
  const body = (await response.json()) as Record<string, unknown>;

  expect(body.admin).toBe(true);
  expect(body).not.toHaveProperty("roleIds");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
