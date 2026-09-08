import { env } from "cloudflare:workers";
import { sendPatiently } from "~/lib/rate-limit";
import { GUILD_ID } from "./config";

/** Change only this guild's nickname; Discord account identity is untouched. */
export async function changeGuildNickname(
  userId: string,
  nickname: string,
): Promise<void> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord nickname updates are unavailable");

  const response = await sendPatiently(
    () =>
      fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
        {
          method: "PATCH",
          headers: {
            authorization: `Bot ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ nick: nickname }),
        },
      ),
    "discord nickname update",
  );
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "Discord role hierarchy prevents changing this nickname"
        : `Discord refused the nickname change (${response.status})`,
    );
  }
}
