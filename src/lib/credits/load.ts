/*
  The Sheet, which is all of the archive that needs a secret. WordPress is read
  and the archive built in the browser (ADR 0012): on the Workers free plan a
  request gets 10 ms of CPU, and parsing every post's body takes several times
  that.
*/

import { env } from "cloudflare:workers";
import { Sheets } from "~/lib/services/google/sheets";
import { readSheet, type SheetState } from "./sheet";

/** what /api/archive.json answers: the Sheet as read, and where to open it */
export type SheetPayload = { sheet: SheetState; url?: string };

/*
  one client per isolate, so its OAuth token is reused until it expires rather
  than signed again on every request. Secrets cannot change under a running
  isolate: a new value arrives with a new version, which is a new isolate
*/
let client: Sheets | { missing: string[] } | undefined;

/** the Sheet client, or which settings are missing */
export function sheetsClient(): Sheets | { missing: string[] } {
  client ??= makeClient();
  return client;
}

function makeClient(): Sheets | { missing: string[] } {
  const key = env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  const id = env.GOOGLE_SHEET_ID?.trim();
  const missing = [
    !key && "GOOGLE_SERVICE_ACCOUNT_KEY",
    !id && "GOOGLE_SHEET_ID",
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) return { missing };

  try {
    return new Sheets(key!, id!);
  } catch (error) {
    return { missing: [`GOOGLE_SERVICE_ACCOUNT_KEY (${String(error)})`] };
  }
}

export async function loadSheet(): Promise<SheetPayload> {
  const sheets = sheetsClient();
  if (!(sheets instanceof Sheets))
    return { sheet: { status: "unconfigured", missing: sheets.missing } };

  const sheet = await readSheet(sheets);
  const id = env.GOOGLE_SHEET_ID?.trim();
  return {
    sheet,
    url:
      sheet.status === "read" && id
        ? `https://docs.google.com/spreadsheets/d/${id}/edit`
        : undefined,
  };
}
