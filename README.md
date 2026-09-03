# HareWare

The in-house tooling for [The Hare](https://theumdhare.com): the editorial
board's article tracker, and a set of tools that turn published articles into
Instagram posts, InDesign copy and newsletter content. Everything renders inside
one dashboard; the tools are open to anyone, and the article board needs a club
Discord account.

Shared vocabulary lives in [CONTEXT.md](CONTEXT.md) and the decisions behind the
shape of it in [docs/adr](docs/adr).

## Development

```sh
npm install
npm run dev
```

`npm run dev` runs the app in workerd, the same runtime Cloudflare serves it
with, via the adapter's Vite plugin.

### When workerd will not start

workerd's allocator assumes a 48-bit userspace address space. Raspberry Pi's
64-bit kernel gives it 39 (`CONFIG_ARM64_VA_BITS=39`), so on a Pi it aborts
before it can start. This takes out `npm run dev`, `npm run preview` and
`wrangler dev --remote` alike — remote mode is no way around it, because it
still runs a local workerd to proxy through. It is a property of the machine
rather than of this project: see
[workerd#5020](https://github.com/cloudflare/workerd/issues/5020).

Building, typechecking and deploying are all unaffected. On such a machine,
check your work against a preview deployment instead of a dev server:

```sh
npm run build
npx wrangler versions upload   # uploads a version, prints a preview url
```

## Deployment

Pushes deploy through Cloudflare Workers Builds. `npm run deploy` publishes from
a terminal when you need it.

## Discord OAuth setup

OAuth uses one Discord application for localhost and production. This is a
one-time setup; its automatically created bot user is left untouched until the
bot itself is implemented.

1. Enable two-factor authentication on your Discord account, then create or
   select the club's [Developer Team](https://discord.com/developers/teams).
2. [Create the HareWare application](https://discord.com/developers/applications?new_application=true)
   under that team. On **OAuth2 → General**, copy its Client ID into
   `DISCORD_CLIENT_ID` in `wrangler.jsonc`.
3. Copy the Client Secret into a new ignored `.dev.vars` file. Generate the
   session key with `openssl rand -hex 32` and put that in the same file:

   ```dotenv
   DISCORD_CLIENT_SECRET="paste the Discord client secret"
   SESSION_SECRET="paste the generated value"
   ```

4. Under **OAuth2 → Redirects**, add both exact callback URLs and save changes:

   ```text
   http://localhost:4321/auth/discord/callback
   https://<production-origin>/auth/discord/callback
   ```

   Discord matches these exactly, including scheme and trailing slash. Do not
   add preview deployment URLs.

5. Authenticate Wrangler and upload the two values in `.dev.vars` as deployed
   Worker runtime secrets:

   ```sh
   npx wrangler login
   npx wrangler whoami
   npx wrangler secret bulk .dev.vars
   ```

   The bulk command uploads every value in that file, creates one Worker
   version, and deploys it immediately. These must be runtime secrets—not
   Workers Builds secrets, which exist only while the project is building.

6. Run `npm run dev`, then verify sign-in, the displayed Discord ID, denial, and
   sign-out locally. Repeat the same checks on production.

Discord setup reference: [OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).
Cloudflare setup reference: [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
