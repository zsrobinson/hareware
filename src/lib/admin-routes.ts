/*
  The board's tools, for the nav and for nav.test. The pages themselves are
  static shells; what they show is gated by the APIs they ask (ADR 0012).
*/

export const ADMIN_ROUTES = [
  "/charts",
  "/people",
  "/articles",
  "/problems",
  "/settings",
  "/reminder",
] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];
