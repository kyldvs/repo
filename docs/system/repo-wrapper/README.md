# Repo wrapper

`src/repo/` holds **typed wrappers around built-in libraries** —
`node:fs`, `node:path`, `node:os`, `node:child_process`, and so on.
Every wrapper exports a single bag of functions named `Repo<Lib>`
(`RepoFs`, `RepoPath`, ...) from `src/repo/<lib>/index.ts`. The rest
of the codebase uses *only* these wrappers; direct stdlib imports are
banned outside `src/repo/`.

## Why

- **One chokepoint per stdlib module.** All filesystem side effects
  flow through `RepoFs`. Audit, instrument, or change behavior in one
  place.
- **Better types than the stdlib.** Drop `Buffer | string` ambiguity,
  return discriminated results where useful (`stat() → Stat | null`
  beats try/catch-on-ENOENT scattered across callers), expose only the
  fields callers actually use.
- **A DI seam for testing.** Each wrapper exports both a `Repo<Lib>`
  singleton (the real implementation) and a `<Lib>` type. Tests
  construct stubs that satisfy the type without touching disk,
  network, or processes.
- **Guardrails.** Atomic writes, consistent error shapes, opt-in
  recursive flags — once, in one place, instead of re-implemented at
  every call site.
- **Discoverability.** A new contributor finds every available
  filesystem operation by reading one file.

## Shape

Every wrapper follows the same pattern:

```ts
// src/repo/<lib>/index.ts

export type Stat = { /* ...narrow shape... */ };

export type Fs = {
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  // ...
};

export const RepoFs: Fs = { /* the only file allowed to import node:fs */ };
```

- `Repo<Lib>` is the singleton real implementation. Callers import
  and use it directly: `RepoFs.write(p, text)`.
- `<Lib>` is the structural type. Used for DI and stub construction.
- The `index.ts` of each wrapper is the **only** file in the repo
  permitted to import the wrapped stdlib module.

## Call site

```ts
import { RepoFs } from "@/repo/fs";

const text = await RepoFs.read(configPath);
const stat = await RepoFs.stat(maybePath);
if (!stat?.isDir) throw new Error(`not a directory: ${maybePath}`);
await RepoFs.write(outPath, JSON.stringify(value));
```

For modules with heavy fs interaction, accept an optional `fs: Fs =
RepoFs` parameter so tests can inject a stub:

```ts
import type { Fs } from "@/repo/fs";
import { RepoFs } from "@/repo/fs";

export function loadCatalog(opts: { fs?: Fs } = {}): Catalog {
  const fs = opts.fs ?? RepoFs;
  // ...
}
```

## File layout

```
src/repo/<lib>/index.ts                 # the wrapper; only file allowed to import the stdlib module
src/repo/<lib>/__test__/index.test.ts   # real-impl tests against a tmpdir / real env
src/repo/<lib>/__test__/stub.ts         # in-memory stub implementing <Lib>, shared across tests
docs/system/repo-wrapper/                # this documentation
docs/system/repo-wrapper/plan/           # one plan per wrapper
```

## Principles in play

- [Look before you leap](../../principles/look-before-leap.md) — wrap
  only what existing callers use; no speculative coverage.
- [Interface planning](../../principles/interface-planning.md) — every
  wrapper plan starts by sketching call sites, not types.
- [Compose](../../principles/compose.md) — wrappers are small typed
  primitives. Higher-level helpers (e.g. `readJson`) compose them in
  callers, not in the wrapper itself.
- [Make it easy](../../principles/make-it-easy.md) — the wrapper layer
  is substrate so the rest of the repo can stop thinking about stdlib
  ergonomics.
- [Verify](../../principles/verify.md) — Biome `noRestrictedImports`
  is the durable guardrail; lint failure on a forbidden stdlib import
  is the bright-line signal.

## Authoring a new wrapper

1. **Inventory the call sites.** Grep `src/` for every existing import
   of the stdlib module. Wrap only what is actually used.
2. **Write the plan.** Add `docs/system/repo-wrapper/plan/NN-<lib>.md`
   following the shape of `01-fs.md`: goal, inventory, call-site
   sketch, types, DI, migration order, verification.
3. **Implement** `src/repo/<lib>/index.ts` exporting `Repo<Lib>` and
   `<Lib>`.
4. **Test.** `src/repo/<lib>/__test__/` covers each method against
   real behavior, plus a stub + conformance test.
5. **Migrate callers** smallest blast radius first.
6. **Extend the Biome rule** to ban the wrapped stdlib module
   everywhere except `src/repo/<lib>/**`. Land the rule *after*
   migration so CI is green from day one.

## Plans

- [`01-fs.md`](plan/01-fs.md) — `node:fs` → `RepoFs`. First wrapper;
  establishes the pattern.

## Gotchas

- Don't import a wrapped stdlib module outside its own
  `src/repo/<lib>/index.ts`. Biome enforces this.
- Don't add methods to a wrapper for hypothetical callers. Wrap on
  demand; deletion of unused surface is harder than addition.
- Don't smuggle stdlib types through the wrapper (e.g. returning
  `node:fs.Stats` directly). Define a narrow shape so the wrapper
  owns its surface.
- Don't put higher-level helpers (`readJson`, `writeYaml`) in the
  wrapper. They compose the wrapper at the caller; introduce them
  only when a pattern actually repeats.
- Don't skip the DI seam by reaching for module mocking in tests. The
  `Fs`-style structural type is the seam; use it.
