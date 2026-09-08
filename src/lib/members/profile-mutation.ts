import type { Person } from "./records";

export type ProfileActor = { discordId: string; editor: boolean };
export type ProfileIntent =
  | { action: "create"; name: string; email: string; status: string }
  | {
      action: "name" | "email" | "status";
      value: string;
      selectedPageId?: string;
    }
  | { action: "nickname"; value: string; selectedPageId?: string };

type Audit = { outcome: "ok" | "failed"; actor: string; summary: string };
export type ProfileMutationDependencies = {
  people: () => Promise<Person[]>;
  statuses: () => Promise<string[]>;
  create: (fields: {
    name: string;
    email: string;
    status: string;
    discordId: string;
  }) => Promise<string>;
  update: (
    pageId: string,
    fields: { name?: string; email?: string; status?: string },
  ) => Promise<void>;
  nickname: (discordId: string, nickname: string) => Promise<void>;
  record: (entry: Audit) => Promise<unknown>;
};

function target(
  roster: Person[],
  actor: ProfileActor,
  selectedPageId?: string,
): Person {
  if (selectedPageId && actor.editor) {
    const selected = roster.find((person) => person.pageId === selectedPageId);
    if (!selected) throw new Error("Member not found");
    return selected;
  }
  const linked = roster.filter(
    (person) => person.discordId === actor.discordId,
  );
  if (linked.length !== 1)
    throw new Error(
      linked.length ? "Discord identity is ambiguous" : "No linked Member",
    );
  return linked[0]!;
}

export async function mutateProfile(
  deps: ProfileMutationDependencies,
  actor: ProfileActor,
  intent: ProfileIntent,
): Promise<Record<string, unknown>> {
  let subject = "unlinked Member";
  try {
    const roster = await deps.people();
    if (intent.action === "create") {
      const linked = roster.filter(
        (person) => person.discordId === actor.discordId,
      );
      if (linked.length > 1) throw new Error("Discord identity is ambiguous");
      if (linked.length === 1)
        return { pageId: linked[0]!.pageId, concurrent: true };
      const options = await deps.statuses();
      if (!options.includes(intent.status))
        throw new Error(`${intent.status} is not a current Member status`);
      const pageId = await deps.create({
        ...intent,
        discordId: actor.discordId,
      });
      subject = pageId;
      await deps.record({
        outcome: "ok",
        actor: actor.discordId,
        summary: `created Member ${pageId} from profile`,
      });
      return { pageId };
    }

    const member = target(roster, actor, intent.selectedPageId);
    subject = member.pageId;
    if (intent.action === "nickname") {
      if (!member.discordId) throw new Error("Member has no Discord identity");
      await deps.nickname(member.discordId, intent.value);
      await deps.record({
        outcome: "ok",
        actor: actor.discordId,
        summary: `changed Discord nickname for Member ${subject}`,
      });
      return { pageId: subject, nickname: intent.value };
    }
    if (intent.action === "status") {
      const options = await deps.statuses();
      if (!options.includes(intent.value))
        throw new Error(`${intent.value} is not a current Member status`);
    }
    await deps.update(member.pageId, { [intent.action]: intent.value });
    await deps.record({
      outcome: "ok",
      actor: actor.discordId,
      summary: `changed ${intent.action} for Member ${subject}`,
    });
    return { pageId: subject, [intent.action]: intent.value };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    await deps.record({
      outcome: "failed",
      actor: actor.discordId,
      summary: `profile edit for ${subject} failed: ${why}`,
    });
    throw error;
  }
}
