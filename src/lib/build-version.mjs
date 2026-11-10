// @ts-check
/*
  What is deployed, as a string a person can act on. Read by astro.config.mjs
  at build time, so it is plain JavaScript that node can load on its own.
*/
import { execFileSync } from "node:child_process";
import process from "node:process";

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  }).trim();

/**
 * the highest `vX.Y.Z` tag in `git ls-remote --tags` output
 * @param {string} listing
 * @returns {string | undefined}
 */
export function newestTag(listing) {
  const versions = listing
    .split("\n")
    .map((line) => /refs\/tags\/(v(\d+)\.(\d+)\.(\d+))$/.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => ({
      tag: match[1],
      parts: [match[2], match[3], match[4]].map(Number),
    }));
  versions.sort((a, b) => {
    for (let i = 0; i < 3; i++)
      if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
    return 0;
  });
  return versions.at(-1)?.tag;
}

/**
 * `git describe` gives the nearest tag plus how far past it we are. A shallow
 * clone, which is what Workers Builds makes, has no tags, so describe falls
 * back to a bare hash; then the remote is asked for its newest tag, and the
 * version reads `<tag>-g<hash>`, the shape the sidebar already links. The env
 * var Workers CI sets is the backstop and "unknown" is the floor: a version
 * nobody can read is worse than one that admits it does not know.
 */
export function version() {
  let described;
  try {
    described = git("describe", "--tags", "--always", "--dirty");
  } catch {
    return process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? "unknown";
  }
  if (/^v\d/.test(described)) return described;

  try {
    const tag = newestTag(git("ls-remote", "--tags", "--refs", "origin"));
    if (tag) return `${tag}-g${described}`;
  } catch {
    /* no remote to ask: the hash alone still names the commit */
  }
  return described;
}
