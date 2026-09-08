import { expect, test, vi } from "vitest";
import type { Person } from "./records";
import {
  mutateProfile,
  type ProfileMutationDependencies,
} from "./profile-mutation";

const person = (pageId: string, discordId: string | null): Person => ({
  pageId,
  discordId,
  name: pageId,
  email: null,
  status: "Undergrad",
  contributions: 0,
  noAnnouncements: false,
});

function dependencies(people: Person[]): ProfileMutationDependencies {
  return {
    people: vi.fn().mockResolvedValue(people),
    statuses: vi.fn().mockResolvedValue(["Undergrad", "Grad", "Alum"]),
    create: vi.fn().mockResolvedValue("created"),
    update: vi.fn(),
    nickname: vi.fn(),
    record: vi.fn(),
  };
}

test("self-service ignores a browser target and updates the uniquely linked Member", async () => {
  const deps = dependencies([person("self", "42"), person("other", "84")]);
  const result = await mutateProfile(
    deps,
    { discordId: "42", editor: false },
    {
      action: "email",
      selectedPageId: "other",
      value: "bay@example.com",
    },
  );
  expect(deps.update).toHaveBeenCalledWith("self", {
    email: "bay@example.com",
  });
  expect(result).toEqual({
    action: "email",
    pageId: "self",
    value: "bay@example.com",
  });
  expect(deps.record).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "ok",
      actor: "42",
      summary: expect.stringContaining("self"),
    }),
  );
});

test("an editor may update an explicitly selected Member while remaining the actor", async () => {
  const deps = dependencies([person("self", "42"), person("other", "84")]);
  await mutateProfile(
    deps,
    { discordId: "42", editor: true },
    {
      action: "name",
      selectedPageId: "other",
      value: "Other Name",
    },
  );
  expect(deps.update).toHaveBeenCalledWith("other", { name: "Other Name" });
  expect(deps.record).toHaveBeenCalledWith(
    expect.objectContaining({
      actor: "42",
      summary: expect.stringContaining("other"),
    }),
  );
});

test("creation re-reads identity and returns a concurrent link instead of creating a duplicate", async () => {
  const deps = dependencies([person("now-linked", "42")]);
  const result = await mutateProfile(
    deps,
    { discordId: "42", editor: false },
    {
      action: "create",
      name: "Bay Hoffman",
      email: "bay@example.com",
      status: "Undergrad",
    },
  );
  expect(deps.create).not.toHaveBeenCalled();
  expect(result).toEqual({
    action: "create",
    pageId: "now-linked",
    concurrent: true,
  });
});

test("an audit outage cannot turn a confirmed mutation into a failure", async () => {
  const deps = dependencies([person("self", "42")]);
  vi.mocked(deps.record).mockRejectedValue(new Error("D1 unavailable"));

  await expect(
    mutateProfile(
      deps,
      { discordId: "42", editor: false },
      {
        action: "name",
        value: "Bay Hoffman",
      },
    ),
  ).resolves.toEqual({ action: "name", pageId: "self", value: "Bay Hoffman" });
  expect(deps.update).toHaveBeenCalledOnce();
  expect(deps.record).toHaveBeenCalledOnce();
});

test("a failed write keeps its original error when failure logging is unavailable", async () => {
  const deps = dependencies([person("self", "42")]);
  vi.mocked(deps.update).mockRejectedValue(new Error("Notion refused"));
  vi.mocked(deps.record).mockRejectedValue(new Error("D1 unavailable"));

  await expect(
    mutateProfile(
      deps,
      { discordId: "42", editor: false },
      {
        action: "email",
        value: "bay@example.com",
      },
    ),
  ).rejects.toThrow("Notion refused");
  expect(deps.record).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "failed" }),
  );
});

test("a failed Discord nickname write is logged and does not touch Notion", async () => {
  const deps = dependencies([person("self", "42")]);
  vi.mocked(deps.nickname).mockRejectedValue(new Error("role hierarchy"));
  await expect(
    mutateProfile(
      deps,
      { discordId: "42", editor: false },
      {
        action: "nickname",
        value: "Bay",
      },
    ),
  ).rejects.toThrow("role hierarchy");
  expect(deps.update).not.toHaveBeenCalled();
  expect(deps.record).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "failed", actor: "42" }),
  );
});
