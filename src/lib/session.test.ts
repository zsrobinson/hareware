import { expect, test, vi } from "vitest";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionCookie,
  getSession,
} from "./session";

const SECRET = "s".repeat(32);

const withCookie = async (cookie: string) =>
  getSession(
    new Request("https://hareware.test/", { headers: { cookie } }),
    SECRET,
  );

const cookieFrom = (header: string) => header.split(";")[0]!;

test("round-trips a signed session", async () => {
  const header = await createSessionCookie({ discordUserId: "123" }, SECRET);
  expect(await withCookie(cookieFrom(header))).toEqual({
    discordUserId: "123",
  });
});

test("sets the flags that keep a cookie out of reach", async () => {
  const header = await createSessionCookie({ discordUserId: "123" }, SECRET);

  expect(header).toContain(`${SESSION_COOKIE}=`);
  expect(header).toContain("HttpOnly");
  expect(header).toContain("Secure");
  expect(header).toContain("SameSite=Lax");
  expect(header).toContain("Max-Age=");
});

test("rejects a session signed with another secret", async () => {
  const header = await createSessionCookie(
    { discordUserId: "123" },
    "other".repeat(8),
  );
  expect(await withCookie(cookieFrom(header))).toBeNull();
});

test("rejects a tampered payload", async () => {
  const header = await createSessionCookie({ discordUserId: "123" }, SECRET);
  const [name, value] = cookieFrom(header).split("=");
  const [, signature] = value!.split(".");

  expect(await withCookie(`${name}=tampered.${signature}`)).toBeNull();
});

test("rejects nonsense", async () => {
  expect(await withCookie(`${SESSION_COOKIE}=nonsense`)).toBeNull();
  expect(await withCookie("")).toBeNull();
});

/*
  a signed cookie cannot be withdrawn once issued, so the expiry inside the
  signature is the only bound on a stolen one. the browser's Max-Age is a
  courtesy, not a control
*/
test("rejects a session past its expiry", async () => {
  const header = await createSessionCookie({ discordUserId: "123" }, SECRET);
  const cookie = cookieFrom(header);

  expect(await withCookie(cookie)).not.toBeNull();

  vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
  expect(await withCookie(cookie)).toBeNull();
  vi.useRealTimers();
});

test("clearing sets an immediate expiry", () => {
  expect(clearSessionCookie()).toContain("Max-Age=0");
});
