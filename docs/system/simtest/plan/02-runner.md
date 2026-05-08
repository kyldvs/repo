# Plan 02 — Simtest YAML runner

Goal: make `src/__simtest__/setup.simtest.yaml` runnable end-to-end
via `./cmd simtest run` and via `bun test`. The runner composes the
actions and assertions from plan 01 by spawning subprocesses through
`./cmd sim_action` and `./cmd sim_assert`.

Pre-req: plan 01 complete.

## Relevant docs

- [verify](../../../principles/verify.md) — `setup.simtest.yaml`
  becomes a real, reproducible verification at the end of this plan.
- [declarative](../../../principles/declarative.md) — the simtest
  YAML stays pure data; the runner is the only place that knows how
  to execute steps.
- [compose](../../../principles/compose.md) — the runner does
  nothing the actions can't already do; it just orchestrates them.
- [interface-planning](../../../principles/interface-planning.md) —
  the action protocol from plan 01 is fixed, so this plan is
  orchestration only. Don't drift the protocol.
- [one-language](../../../principles/one-language.md) — the runner
  is TypeScript on Bun; YAML is data, not code.
- Existing systems touched: plan 01's action protocol
  (`./cmd sim_action`, `./cmd sim_assert`); the existing
  `src/__simtest__/setup.simtest.yaml`; the `cmd` dispatcher.

## Definition of done

- `./cmd simtest run src/__simtest__/setup.simtest.yaml` exits 0 and
  prints a single-line pass result.
- `./cmd simtest run` (no args) discovers every `*.simtest.yaml`
  under `src/` and runs each, exiting 0 iff all pass.
- `bun test` includes the simtest(s) and reports each as a passing
  test case.
- Removing or breaking any step in `setup.simtest.yaml` causes a
  failure with a message that names the simtest, step index, and
  underlying error.
- Two simtests run back-to-back share **no** filesystem state
  (different `tmp/sim/<run-id>/` per run; cleaned at end).

## Scope

In:

- YAML loading for `*.simtest.yaml`.
- Structural validation of each simtest before execution: every
  `action:` / `assert:` / `assert_not:` resolves against the
  catalog from plan 01; every input key is declared; required
  inputs are present.
- A linear executor that:
  - allocates `tmp/sim/<run-id>/` for the run,
  - tracks cwd and a flat variable namespace,
  - resolves `${{ steps.<name> }}` template substitution for
    string-typed inputs,
  - writes each step's input to
    `tmp/sim/<run-id>/step-<n>-input.json`,
  - spawns `./cmd sim_action <name> <in> <out>` (or
    `sim_assert`) per step,
  - reads the output JSON and binds named outputs into the
    variable namespace,
  - special-cases `cd`: after the action returns, sets `ctx.cwd`
    from the step's resolved input `path`,
  - on failure, stops and propagates a structured error,
  - removes `tmp/sim/<run-id>/` (recursively) on completion,
    pass or fail.
- `./cmd simtest run [path]` entrypoint.
- `bun test` integration via `src/__simtest__/_runner.test.ts`,
  which discovers sibling `*.simtest.yaml` files and registers a
  `test(name, ...)` per file.

Out (deferred):

- Diagnosable failures with rich pretty-printing (plan 03).
- Strict schema validation with `file:line` pointers (plan 03).
- Meta-testing the runner (plan 03).
- Parallel execution, watch mode, tags, filtering, parameters,
  includes (plan 04).
- Anything not exercised by `setup.simtest.yaml`.

## Build order

Each step lands as its own commit so failures bisect cleanly.

### 1. Simtest loader

- `src/cli/sim/load.ts` — `loadSimtest(path): Simtest`. Validates
  required fields (`name`, `desc`, `steps`), normalizes step shapes,
  rejects unknown top-level keys.
- Catalog loading is already in `src/cli/sim/protocol.ts` (plan 01);
  reuse it.

### 2. Pre-execution validation

- `src/cli/sim/validate.ts` — `validateSimtest(simtest, catalog)`:
  every step references a known action/assertion; every `input:`
  key is declared; required inputs are present (after templates,
  but template values are unknown until runtime — so this checks
  *presence* of the key, not the value). Every `output:` key is
  declared on the action.
- This runs once per simtest, before execution.

### 3. Template substitution

- `src/cli/sim/template.ts` — `substitute(value, vars)`:
  - if `value` is a string and matches the regex
    `^\$\{\{\s*steps\.([\w-]+)\s*\}\}$`, look up the variable;
    throw "unbound variable: <name>" if missing,
  - otherwise return as-is.
- Whole-string substitution only. No mid-string interpolation, no
  nested expressions. Plan 04 adds more if a real simtest demands
  it.

### 4. Runner engine

- `src/cli/sim/run.ts` — `runSimtest(path): Promise<RunResult>`:
  - load + validate the simtest,
  - generate a run id (e.g. `<simtest-name>-<timestamp>-<rand>`),
  - `mkdir -p tmp/sim/<run-id>/`,
  - initialize `ctx = { cwd: process.cwd(), vars: {} }`,
  - for each step (index `n`, starting at 0):
    1. resolve inputs (substitute templates),
    2. write resolved input to
       `tmp/sim/<run-id>/step-<n>-input.json`,
    3. spawn the dispatcher with `cwd: ctx.cwd`:
       `./cmd sim_action <name> <in> <out>` or
       `./cmd sim_assert <name> <in> <out>`,
    4. on non-zero exit: collect stderr, propagate a structured
       error (`{ stepIndex: n, stepKind, name, stderr }`),
    5. read `tmp/sim/<run-id>/step-<n>-output.json`,
    6. for actions: bind declared outputs to `ctx.vars` per the
       step's `output:` block,
    7. for `cd` action specifically: `ctx.cwd = resolve(ctx.cwd,
       step.input.path)` after success,
    8. for assertions: read `{ ok }`; fail the simtest if
       `assert:` and `!ok`, or if `assert_not:` and `ok`,
  - on outcome (pass or fail): `rm -rf tmp/sim/<run-id>/`,
  - return `{ ok, error?, steps: StepResult[] }`.

The runner is the only place that knows about cwd, vars, cleanup,
or the special `cd` rule. Actions remain dumb leaves.

### 5. CLI entrypoint

- `src/cli/cmd/simtest/main.ts`:
  - `simtest run <path>` runs one file.
  - `simtest run` discovers `src/**/*.simtest.yaml`, runs each, and
    accumulates the exit code.
  - One line per simtest: `PASS <name>` or `FAIL <name>: <reason>`.
  - Final summary: `<n> passed, <m> failed in <t>ms`.
  - No frameworks; print directly.

### 6. Bun test integration

- `src/__simtest__/_runner.test.ts` (one file, intentionally
  underscored to make discovery trivial):
  - reads its sibling `*.simtest.yaml` files,
  - for each, registers `test(name, async () => { ... })` that
    calls `runSimtest(path)` and asserts `result.ok`,
  - on failure, throws with the same one-line reason the CLI
    prints.

## Risks and mitigations

- **Subprocess startup overhead is N+1 per simtest.** For plan 02's
  scope (one simtest, seven-ish steps), this is fine on any machine
  that already runs `bun install`. Plan 03 measures per-step
  durations; optimization, if needed, lands later.
- **Tmp leaks on crash.** The runner removes `tmp/sim/<run-id>/` in
  a `finally`. Even on hard crash, the OS still has its own tmp;
  the repo's `tmp/` is gitignored so leftover dirs don't leak into
  commits.
- **Action/runner protocol drift.** The runner only ever calls
  actions through `./cmd sim_action`/`./cmd sim_assert`. Any
  protocol change is a plan-01-level change and rolls forward to
  the runner with no special-casing here.
- **`cd` special-casing.** The runner has one and only one
  hardcoded action behavior: `cd` updates `ctx.cwd`. If a second
  cwd-mutating action ever appears, generalize then — not now. See
  [`compose`](../../../principles/compose.md) on not generalizing
  from one.
- **Template ambiguity.** Whole-string substitution only; documented.
  Concat and nesting wait for a real use case.

## Gotchas

- Don't read or write outside `tmp/sim/<run-id>/` from the runner.
  All ephemeral state is per-run.
- Don't reach into an action's internals. The runner only sees the
  JSON contract.
- Don't extend `cd`'s special-case to a generic "side-effecting
  action" abstraction. One concrete case is not a pattern.
- Don't have the bun-test wrapper duplicate discovery logic. It
  uses the same loader the CLI does.
- Don't fail silently on a non-zero subprocess exit. Capture stderr
  and surface it on the simtest failure.
- Don't share `ctx` between simtests. Every simtest gets a fresh
  one — that's the isolation contract plan 03 hardens.

## Out-of-scope reminders

If you're tempted to add: structured failure formatting beyond
"step index + reason", per-step durations, JSON output mode, meta
tests, CI integration, container actions, parallelism, includes,
parameters, or tags — stop. Plan 03 covers maturation; plan 04
covers expansion.
