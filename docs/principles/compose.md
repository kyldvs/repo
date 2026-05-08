# Compose

Prefer composability when designing abstractions. Small, typed pieces
that snap together beat large pieces that almost fit.

## Why

- Composable parts are reusable across scenarios their author didn't
  imagine.
- A bug in one piece doesn't infect the others.
- Replacement is cheap: swap a piece, keep the rest.

## How to apply

- Build primitives with narrow contracts and clear types. Let scenarios
  emerge from composition, not from new bespoke code.
- Separate orchestration from implementation. The thing that *runs*
  steps shouldn't know what each step does.
- Make the seams declarative where possible — config that names
  primitives is easier to recombine than code that calls them.
- If two primitives keep being used together, that's a hint about a
  higher-level primitive — not a license to fuse them.

## Smell tests

- An abstraction that takes a giant options bag is usually several
  abstractions in a trench coat.
- A "helper" that only one caller will ever use isn't a helper.
- If you can't describe a piece in one line without "and", it's doing
  too much.

## Example in this repo

Simtest splits *actions* (typed primitives) from *simtests*
(declarative pipelines). The same action library serves normal
verification and meta-testing because no action knows about its
caller. See `docs/system/simtest/`.
