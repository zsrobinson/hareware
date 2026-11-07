/*
  Google Sheets as a service account. The key is the whole JSON file Google
  hands out, stored as one secret; only two of its fields are read. Signing is
  RS256 through WebCrypto, so this needs no Google library.
*/

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

type ServiceAccount = { client_email: string; private_key: string };

/** a cell as the API returns it with the default render: always a string */
export type Rows = string[][];

/** the service account's email, for telling somebody whom to share with */
export function serviceAccountEmail(keyJson: string): string | undefined {
  try {
    return parseKey(keyJson).client_email;
  } catch {
    return undefined;
  }
}

export class Sheets {
  private token?: { value: string; expires: number };
  private readonly key: ServiceAccount;

  constructor(
    keyJson: string,
    private readonly spreadsheetId: string,
  ) {
    this.key = parseKey(keyJson);
  }

  /** each tab's title */
  async tabs(): Promise<string[]> {
    const body = (await this.call(
      `${API}/${this.spreadsheetId}?fields=sheets.properties.title`,
    )) as { sheets?: { properties: { title: string } }[] };

    return (body.sheets ?? []).map((sheet) => sheet.properties.title);
  }

  /**
   * every row of each named tab, keyed by title. A tab that does not exist is
   * absent from the result, not an empty list: those are different answers
   */
  async read(titles: string[]): Promise<Map<string, Rows>> {
    const existing = new Set(await this.tabs());
    const present = titles.filter((title) => existing.has(title));
    const found = new Map<string, Rows>();
    if (present.length === 0) return found;

    const params = new URLSearchParams();
    for (const title of present) params.append("ranges", quote(title));

    const body = (await this.call(
      `${API}/${this.spreadsheetId}/values:batchGet?${params}`,
    )) as { valueRanges?: { values?: Rows }[] };

    present.forEach((title, index) =>
      found.set(title, body.valueRanges?.[index]?.values ?? []),
    );
    return found;
  }

  async addTab(title: string): Promise<void> {
    await this.call(`${API}/${this.spreadsheetId}:batchUpdate`, {
      requests: [
        {
          addSheet: {
            properties: { title, gridProperties: { frozenRowCount: 1 } },
          },
        },
      ],
    });
  }

  /** writes `rows` starting at A1, leaving anything below them alone */
  async write(title: string, rows: Rows): Promise<void> {
    await this.call(
      `${API}/${this.spreadsheetId}/values/${encodeURIComponent(quote(title))}?valueInputOption=RAW`,
      { range: quote(title), majorDimension: "ROWS", values: rows },
      "PUT",
    );
  }

  /** adds rows after the last row with anything in it */
  async append(title: string, rows: Rows): Promise<void> {
    await this.call(
      `${API}/${this.spreadsheetId}/values/${encodeURIComponent(quote(title))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { majorDimension: "ROWS", values: rows },
    );
  }

  private async call(url: string, body?: unknown, method?: string) {
    const response = await fetch(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      /* Google's error body names the cause (not shared, API disabled), and
         holds nothing secret */
      const detail = await response.text().catch(() => "");
      throw new Error(
        `google sheets answered ${response.status}: ${detail.slice(0, 300)}`,
      );
    }
    return response.json();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000)
      return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const assertion = await signJwt(this.key, {
      iss: this.key.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok)
      throw new Error(
        `google refused the service account key (${response.status})`,
      );

    const { access_token, expires_in } = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: access_token,
      expires: Date.now() + expires_in * 1000,
    };
    return access_token;
  }
}

function parseKey(keyJson: string): ServiceAccount {
  const parsed = JSON.parse(keyJson) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key)
    throw new Error(
      "the service account key is missing client_email or private_key",
    );
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

/** 'Tab name', which A1 notation needs for any title with a space in it */
function quote(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

async function signJwt(key: ServiceAccount, claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;

  const der = Uint8Array.from(
    atob(key.private_key.replace(/-----[^-]+-----|\s/g, "")),
    (char) => char.charCodeAt(0),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
