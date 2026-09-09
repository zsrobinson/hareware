import { afterEach, expect, test, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
const admin = vi.hoisted(() => ({ viewer: vi.fn() }));
vi.mock("~/lib/admin", () => admin);
const profile = vi.hoisted(() => ({
  readProfilePayload: vi.fn(),
  mutateProfile: vi.fn(),
}));
vi.mock("~/lib/members/profile", () => ({
  readProfilePayload: profile.readProfilePayload,
}));
vi.mock("~/lib/members/profile-mutation", () => ({
  mutateProfile: profile.mutateProfile,
}));
vi.mock("~/lib/members/profile-runtime", () => ({
  profileReadDependencies: () => ({ corpus: vi.fn() }),
  profileMutationDependencies: () => ({}),
}));

const { GET, POST } = await import("./profile");
const who = (adminRole = false) => ({
  session: { discordUserId: "42" },
  profile: {
    displayName: "Bay",
    discordNickname: null,
    username: "bay",
    avatarUrl: "avatar",
  },
  admin: adminRole,
  denial: adminRole ? null : "no-role",
});
const call = (route: unknown, url: string, body?: unknown) =>
  (route as (context: unknown) => Promise<Response>)({
    request: new Request(
      url,
      body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
    ),
  });

afterEach(() => vi.clearAllMocks());

test("profile reads are private and pass editor selection and concrete dates", async () => {
  admin.viewer.mockResolvedValue(who(true));
  profile.readProfilePayload.mockResolvedValue({
    status: "ready",
    statuses: [],
    selectable: [],
  });
  const response = await call(
    GET,
    "https://hareware.test/api/profile?member=p2&from=2026-01-01&to=2026-01-31",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(profile.readProfilePayload).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      actorDiscordId: "42",
      editor: true,
      selectedPageId: "p2",
      from: "2026-01-01",
      to: "2026-01-31",
    }),
  );
});

test("an inverted date range is visible and never reaches the reader", async () => {
  admin.viewer.mockResolvedValue(who());
  const response = await call(
    GET,
    "https://hareware.test/api/profile?from=2026-02-01&to=2026-01-01",
  );
  expect(response.status).toBe(400);
  expect(profile.readProfilePayload).not.toHaveBeenCalled();
});

test("a regular member cannot select another profile in a read", async () => {
  admin.viewer.mockResolvedValue(who(false));
  const response = await call(
    GET,
    "https://hareware.test/api/profile?member=other",
  );
  expect(response.status).toBe(403);
  expect(profile.readProfilePayload).not.toHaveBeenCalled();
});

test("a regular member cannot select another profile in a mutation", async () => {
  admin.viewer.mockResolvedValue(who(false));
  const response = await call(POST, "https://hareware.test/api/profile", {
    action: "email",
    value: "bay@example.com",
    selectedPageId: "other",
    editor: true,
    discordId: "84",
  });
  expect(response.status).toBe(403);
  expect(profile.mutateProfile).not.toHaveBeenCalled();
});
