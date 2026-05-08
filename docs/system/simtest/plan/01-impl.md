# Plan 01 — Initial implementation

Goal: make `src/__simtest__/setup.simtest.yaml` a runnable, passing
test against the declarations in `.config/sim.yaml`. Nothing more.

This plan is deliberately minimal. Anything that isn't required to run
that one file belongs in a later plan. See
[`make-it-easy`](../../../principles/make-it-easy.md) — build the
substrate just well enough for the next concrete need.

## Definition of done

- `./cmd simtest run src/__simtest__/setup.simtest.yaml` exits 0 and
  prints a single-line pass result.
- `bun test` includes the same simtest and reports it as a passing
  test case.
- Removing or breaking any step in `setup.simtest.yaml` causes a
  failure with a message that names the step and the reason.

## Scope

In:

- YAML loading for `.config/sim.yaml` and `*.simtest.yaml`.
- Action catalog validation (every implementation matches its
  declaration; every simtest reference resolves).
- A linear step executor with cwd state and a flat variable namespace.
- Implementations of the four actions in `sim.yaml`:
  `get_main_hash`, `clone_self`, `cd`, `bun_install`.
- Implementations of the two assertions used: `dir_exists`, `is_clean`.
- `${{ steps.<name> }}` substitution for string-typed inputs.
- `./cmd simtest` entrypoint.
- A bun test wrapper that discovers `*.simtest.yaml` and runs each as
  a `test()` case.
- Cleanup of temp directories created by `clone_self`, regardless of
  pass/fail.

Out (deferred):

- Parallel execution.
- Watch mode, filtering, tags.
- Container-backed actions.
- Sub-simtest composition / includes.
- Anything not exercised by `setup.simtest.yaml`.

## Build order

Each step lands as its own commit so failures bisect cleanly.

### 1. YAML loading and types

- `src/simtest/types.ts` — TS types mirroring the catalog and
  simtest schemas (`ActionSpec`, `Simtest`, `Step`, etc.).
- `src/simtest/load.ts` — `loadCatalog()` and `loadSimtest(path)`,
  using the `yaml` dependency already in `package.json`. Each loader
  validates structure (required fields, known types) and throws with
  the file path and location.

### 2. Catalog validation

- `src/simtest/validate.ts` — given a loaded catalog and a loaded
  simtest, verify:
  - every `action:` / `assert:` / `assert_not:` references a known
    name (in the catalog for actions; in the assertion registry for
    assertions);
  - every `input:` key is declared on the action; required inputs are
    present;
  - every `output:` key is declared on the action.
- Validation runs once per simtest, before execution.

### 3. Action registry

- `src/simtest/actions/index.ts` — `Map<string, ActionImpl>`. Each
  `ActionImpl` is `(input, ctx) => Promise<output>`.
- `ctx` exposes the executor state: `cwd`, a tmp-dir tracker, and
  process helpers. Keep it small.
- One file per action under `src/simtest/actions/`:
  - `getMainHash.ts` — `git ls-remote origin main` (or
    `git rev-parse origin/main` after fetch); return the hash string.
  - `cloneSelf.ts` — `git clone --depth 1` of the repo root into a
    `mkdtempSync` directory, then `git checkout <hash>`. Register the
    dir for cleanup.
  - `cd.ts` — mutate `ctx.cwd` after resolving the path.
  - `bunInstall.ts` — `Bun.spawn(["bun", "install", ...])` in
    `ctx.cwd`, with `--frozen-lockfile` controlled by the input.
- A startup check asserts every catalog action has an implementation
  registered, and vice versa. Mismatch is a load-time error.

### 4. Assertion registry

- `src/simtest/asserts/index.ts` — `Map<string, AssertImpl>`. Each
  `AssertImpl` is `(input, ctx) => Promise<boolean>`. Returning
  `false` fails an `assert:`; returning `true` fails an `assert_not:`.
- One file per assertion under `src/simtest/asserts/`:
  - `dirExists.ts` — resolve `path` against `ctx.cwd`; return
    `statSync(...).isDirectory()`.
  - `isClean.ts` — run `git status --porcelain` in `ctx.cwd`; return
    true iff stdout is empty.
- Failure messages include the assertion name, resolved input, and
  the contradicting observation (e.g. "expected node_modules to
  exist; not found").

### 5. Template substitution

- `src/simtest/template.ts` — `substitute(value, vars)`:
  - if `value` is a string and matches `^\\$\\{\\{\\s*steps\\.([\\w-]+)\\s*\\}\\}$`,
    look up the variable; throw if missing.
  - otherwise return as-is.
- Only string-typed inputs go through substitution in this plan.
  Bool/path values can be literal or substituted strings; coercion to
  `path` happens after substitution.

### 6. Executor

- `src/simtest/run.ts` — `runSimtest(simtest, catalog)`:
  - Build initial `ctx` (cwd = repo root, empty `vars`, empty
    `cleanups`).
  - For each step:
    - resolve inputs (substitute, then validate against the declared
      schema);
    - dispatch to the action or assertion registry;
    - on success, bind `output:` names into `vars`;
    - on failure, stop and propagate a structured error that names
      the step index and identifier.
  - Run cleanups in reverse order regardless of outcome.
  - Return `{ ok: boolean, error?, steps: StepResult[] }`.

### 7. CLI entrypoint

- `src/cli/cmd/simtest/main.ts` — wired through the existing `./cmd`
  dispatcher.
  - `simtest run <path>` runs one file.
  - `simtest run` (no args) discovers `src/**/*.simtest.yaml` and
    runs each, accumulating exit code.
  - Output is one line per simtest: `PASS <name>` / `FAIL <name>:
    <reason>`. No frameworks; print directly.

### 8. Bun test integration

- `src/__simtest__/_runner.test.ts` (one file, intentionally
  underscored) — discovers `*.simtest.yaml` siblings, registers a
  `test(name, ...)` per file, calls `runSimtest`, asserts `ok`.
- This is the surface that lets `bun test` cover simtests without
  duplicating discovery logic.

## Risks and mitigations

- **`git clone` of the local working copy can pick up uncommitted
  state.** `clone_self` clones from the configured origin (not the
  working tree) and checks out the hash returned by `get_main_hash`
  so the simtest is deterministic on CI. Make the source explicit
  in the implementation and document it on the action.
- **Tmp-dir leaks on crash.** All `mkdtempSync` calls register a
  cleanup. The executor runs cleanups in a `finally`. The OS tmp
  dir is acceptable as a backstop.
- **Action/catalog drift.** The startup parity check (every declared
  action has an impl, and vice versa) catches it on load, before any
  simtest runs.
- **Templating ambiguity.** Restrict to whole-string substitution in
  this plan. String concatenation and nested expressions wait until
  there's a real use case.

## Out-of-scope reminders

If you're tempted to add: a plugin system, a DSL for assertions,
config-driven action implementations, an event bus, or a watch mode —
stop. Plan 02 covers maturation; expansions belong in 03.
