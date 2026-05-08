# Verify

Everything should be easy to verify. If we can't verify it, build the
harness or simulation that lets us — *before* shipping the thing it's
meant to check.

## Why

- Unverified claims rot. Tribal knowledge ages worse than code.
- A reproducible check from a clean state is the only honest answer to
  "does it still work?"
- Every feature with a verification adds confidence; every feature
  without one adds risk that compounds.

## How to apply

- New features ship with new verification, not new trust.
- If the existing harness can't express the check, extend the harness
  first. Don't bypass it with a one-off script.
- Prefer verifications that run from a clean state — clone, install,
  build, assert. Hidden setup hides bugs.
- Make verifications declarative so they're easy to read, diff, and
  reuse. See `docs/principles/declarative.md`.

## Smell tests

- "It works on my machine." The verification is missing or non-hermetic.
- A test that mocks the thing it's supposed to check.
- A verification that depends on the order of other verifications —
  hidden coupling.
- Manual steps in the verification path. Anything manual will be
  skipped under pressure.

## Rules of thumb

- If you can't verify it, you don't ship it.
- If verifying it is painful, fix the harness before adding the
  feature.
- A passing simtest is the unit of done.

## Example in this repo

Simtests under `src/__simtest__/` are the verification surface. New
features add a simtest (or extend one) using actions declared in
`.config/sim.yaml`. See `docs/system/simtest/` for the system, and
`CLAUDE.md` for the repo-wide rule.
