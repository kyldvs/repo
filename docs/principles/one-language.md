# One language

Prefer a single programming language across the repo. Less infra to
maintain, one set of tooling, fewer context switches.

## Why

- One toolchain: one package manager, one formatter, one linter, one
  test runner, one type system.
- One mental model. Contributors (human and AI) move between files
  without re-learning idioms, error handling, or build steps.
- Fewer cross-language seams. Each FFI boundary is a place bugs hide
  and types disappear.
- Smaller surface for security updates, version bumps, and CI config.

## How to apply

- Default everything — scripts, codegen, tooling, tests — to the
  primary language. In this repo, that's TypeScript on Bun.
- When a task seems to want a second language, first check whether the
  primary language can do it well enough. Usually it can.
- Express config as data (YAML/JSON) consumed by the primary language,
  not as scripts in another runtime.
- If a second language is genuinely required (a binary dependency, a
  spec'd interop), isolate it behind a typed boundary and document the
  reason.

## Smell tests

- A `Makefile` doing real logic alongside `package.json` scripts —
  pick one.
- Shell scripts implementing things the primary language already does.
- A dev tool added in a different runtime "because it's easier" —
  easier now, more infra forever.
- Two test runners. Two formatters. Two ways to run "the thing."

## Counter-balance

- One language doesn't mean one *file format*. Declarative config in
  YAML/JSON is fine; it's data, not a parallel toolchain.
- Don't rewrite a battle-tested tool just to bring it in-language.
  Wrap it.

## Example in this repo

TypeScript on Bun is the only runtime. `./cmd` shells out to `bun`;
simtests are YAML consumed by a TS runner; there is no second package
manager, no second test framework, no Python or Make alongside.
