# CLAUDE.md

## Purpose

This repo is a modular template for spinning up new repos quickly with
standardized opinions for the stack. Treat each piece — tooling, scripts,
config — as a reusable building block that downstream repos inherit.

## Verification

Strong verification is non-negotiable. Every aspect of the repo must be
verifiable from a clean state.

- The clone test (`src/__repotest__/clone.test.ts`) clones the repo into an
  isolated container (podman or docker) and runs install + setup. If it
  passes, a fresh user can reproduce the environment from scratch.
- New features add new verification, not new trust.
- If you can't verify it, you don't ship it.

## Tooling

- Bun is the package manager. All scripts, installs, and runs go through `bun`.
- Do not use `npm`, `pnpm`, `yarn`, or `node` directly.

## Principles

- Less, but better. Prefer deleting code over adding it.
- Everything must have a purpose. If you can't justify it, remove it.
- No speculative abstractions, no dead code, no just-in-case branches.
- Edit existing files before creating new ones.
- Comments only when the *why* isn't obvious from the code.
