# CLAUDE.md

## Purpose

This repo is a modular template for spinning up new repos quickly with
standardized opinions for the stack. Treat each piece — tooling,
scripts, config — as a reusable building block that downstream repos
inherit.

## Principles

These are the principles this repo is built on. Read them before
contributing.

- [Look before you leap](docs/principles/look-before-leap.md) — read existing principles and systems before planning. Plans cite their context.
- [Interface planning](docs/principles/interface-planning.md) — sketch the interface and call sites before the implementation.
- [One language](docs/principles/one-language.md) — TypeScript on Bun, everywhere.
- [Compose](docs/principles/compose.md) — small typed primitives over monoliths.
- [Declarative](docs/principles/declarative.md) — describe *what*; let an executor handle *how*.
- [Make it easy](docs/principles/make-it-easy.md) — invest in the substrate first, then build on it.
- [Verify](docs/principles/verify.md) — every claim must be reproducible from a clean state.
- [Gotchas](docs/principles/gotchas.md) — counter-examples direct AI better than positive rules alone.

## Verification

Strong verification is non-negotiable. Every aspect of the repo must
be verifiable from a clean state.

- Verification lives in `src/__simtest__/` as declarative *simtests*
  composed from actions declared in `.config/sim.yaml`. See
  `docs/system/simtest/` for the system overview.
- New features add new verification, not new trust.
- If you can't verify it, you don't ship it.

## Tooling

- TypeScript on Bun. One language, one toolchain.
- Bun is the package manager. All scripts, installs, and runs go
  through `bun`.
- Do not use `npm`, `pnpm`, `yarn`, or `node` directly.
- Type-check with `bun run typecheck`, which shells to `tsgo --noEmit`
  (the native compiler from `@typescript/native-preview`). Do not
  invoke `tsc` directly.

## House rules

- Less, but better. Prefer deleting code over adding it.
- Everything must have a purpose. If you can't justify it, remove it.
- No speculative abstractions, no dead code, no just-in-case branches.
- Edit existing files before creating new ones.
- Comments only when the *why* isn't obvious from the code.

## Gotchas

- Don't reach for `npm`, `pnpm`, `yarn`, or `node` — Bun owns the
  toolchain.
- Don't invoke `tsc`. Type-check via `bun run typecheck` (which uses
  `tsgo --noEmit`).
- Don't add a second language for "just this script" — TypeScript on
  Bun handles it. See [one-language.md](docs/principles/one-language.md).
- Don't write a one-off verification script — add a simtest action
  and call it from a `*.simtest.yaml`. See `docs/system/simtest/`.
- Don't inline shell in a simtest — add an action to `.config/sim.yaml`
  and implement it in code.
- Don't create a new file when an existing one would do.
- Don't add speculative abstractions or "just-in-case" branches.
- Don't write comments that restate what the code already says.
