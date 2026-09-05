# Code quality

Use this when adding or reorganizing modules, comments, or tests.

## Modules

Prefer deep modules: a small interface that hides a meaningful behavior. Before
adding a file or exported symbol, apply the deletion test: if deleting it merely
moves the same knowledge into every caller, it earns its place; if the knowledge
vanishes, keep the code with its caller.

Place seams where behavior varies. External-system protocols and presentation
belong under `src/lib/services`; domain behavior belongs in its domain folder.
Transport and presentation adapters may depend on domain modules, while domain
modules stay independent of their presentation. Introduce an injected port only
when production and tests both need adapters for it.

Keep one representation of each fact. Derive registries, names, and states from
their authoritative value instead of maintaining parallel lists. Model absence
as a distinct state when an empty value is valid.

## Tests

Test observable behavior through the module's interface. A refactor replaces
tests that reach through the old seam; it does not layer new tests over them.
Keep a focused lower-level test only when it protects a remote-system shape or a
silent failure that the public interface cannot identify precisely.

Every regression test must go red when its fix is removed. Exercise the real
wiring around the fix: do not mock the function or adapter whose output the test
claims to verify.

Use the smallest fixture that makes the behavior legible. Share setup that is
incidental; keep the values central to a test beside its assertion.

## Comments

Comments record constraints, surprising reasons, and remote-system traps. The
code should state what it does. Keep the explanation in the ADR or agent
reference when it already exists there, and leave a short pointer only where a
maintainer would otherwise make the wrong local change.

Delete comments that narrate the next line, repeat a type, preserve development
history, or speculate about future callers. When code changes, remove obsolete
commentary in the same change.

## Completion

Before handing off a structural change:

- Check new imports preserve the intended dependency direction.
- Remove exports and tests made obsolete by the new seam.
- Run `npm run types` when bindings or route `Request` types changed.
- Run `npx astro check`, `npm run lint`, `npm test`, and
  `npm run format:check`.
