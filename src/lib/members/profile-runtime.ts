import { env } from "cloudflare:workers";
import { record } from "~/lib/log";
import { guildMembers } from "~/lib/member";
import { changeGuildNickname } from "~/lib/services/discord/nickname";
import type { ProfileMutationDependencies } from "./profile-mutation";
import type { ProfileReadDependencies } from "./profile";
import { corpus, people, statusOptions } from "./roster";
import { createMember, updateMember } from "./write";

export const profileReadDependencies = (): ProfileReadDependencies => ({
  corpus: () => corpus(env.NOTION_TOKEN!),
  statuses: () => statusOptions(env.NOTION_TOKEN!),
  guildProfiles: guildMembers,
});

export const profileMutationDependencies = (): ProfileMutationDependencies => ({
  people: () => people(env.NOTION_TOKEN!),
  statuses: () => statusOptions(env.NOTION_TOKEN!),
  create: (fields) => createMember(env, fields),
  update: (pageId, fields) => updateMember(env, pageId, fields),
  nickname: changeGuildNickname,
  record: (entry) =>
    record(env.DB, { source: "button", action: "roster-edit", ...entry }),
});
