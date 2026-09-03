/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

declare namespace Cloudflare {
  interface Env {
    DISCORD_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
