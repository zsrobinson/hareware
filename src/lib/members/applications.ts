/* the club's Discord join form, read as identity for the roster. ADR 0010. */

import {
  approvedJoinRequests,
  type JoinRequest,
} from "~/lib/services/discord/join-requests";
import { easternNow } from "~/lib/eastern";

export type Application = {
  id: string;
  discordId: string;
  /** their discord name, for an application with no answers */
  username: string;
  /** null when the question was not answered */
  name: string | null;
  email: string | null;
  /** free text: "Dec 2027" and "It depends" are both real answers */
  gradYear: string | null;
  /** `YYYY-MM-DD` */
  applied: string | null;
};

/**
 * the answer to whichever question mentions `keyword`. By label, not position:
 * an added question would shift every answer into the wrong field, where a
 * reworded one only reads as unanswered
 */
function answer(request: JoinRequest, keyword: string): string | null {
  return (
    request.answers.find((one) => one.question.toLowerCase().includes(keyword))
      ?.answer ?? null
  );
}

function toApplication(request: JoinRequest): Application {
  return {
    id: request.id,
    discordId: request.userId,
    username: request.username,
    name: answer(request, "name"),
    email: answer(request, "email"),
    gradYear: answer(request, "year"),
    /* the Eastern day, like every other date the pages show */
    applied: request.createdAt
      ? easternNow(new Date(request.createdAt)).date
      : null,
  };
}

/** every approved application, read whole each time (ADR 0010) */
export async function approvedApplications(
  token: string | undefined,
): Promise<Application[]> {
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return (await approvedJoinRequests(token)).map(toApplication);
}
