# Plan 02 — Maturation

Goal: turn the working prototype from plan 01 into something safe to
rely on across many simtests. Focus is correctness, diagnosability,
and isolation — not new actions.

Pre-req: plan 01 complete.

## Definition of done

- A failing simtest produces a report that points at the exact step,
  the resolved inputs, and the underlying error, with no stack-trace
  archaeology required.
- Two simtests run back-to-back share **no** filesystem state — temp
  dirs, cwd, env. Verified by a meta-simtest (see below).
- Catalog and simtest schemas have explicit validation with errors
  that name the offending field and file path.
- The simtest runner is itself covered by simtests (meta-testing).
- CI runs `./cmd simtest run` as a required step.

## Areas

### 1. Diagnosable failures

- **Structured errors.** `runSimtest` returns or throws a
  `SimtestError` with: simtest name, step index, step kind
  (`action` / `assert` / `assert_not`), step identifier, resolved
  inputs (with templates expanded), and the wrapped cause.
- **Pretty printer.** A single formatter renders a `SimtestError`
  consistently for the CLI and for `bun test` failure messages.
  Format:

  ```
  FAIL <simtest> :: step #<n> <kind> <name>
    inputs: { ... }
    cause:  <message>
  ```

- **No silent step failures.** Every action implementation must
  surface non-zero exit codes from spawned processes with stdout +
  stderr captured. Truncate to a sane size (e.g. last 4 KiB each)
  before attaching to the error.

### 2. Strict schema validation

- Promote the ad-hoc validators from plan 01 into a single
  `validateCatalog` / `validateSimtest` pair that:
  - rejects unknown top-level keys,
  - rejects unknown step keys,
  - rejects unknown input/output keys per action,
  - validates `type` values against the supported set,
  - rejects defaults whose type doesn't match.
- Errors include `file:line` when possible (the `yaml` package
  exposes positions on parsed nodes — wire them through).

### 3. Type coverage

- Add `int` and `string[]` to the supported type set, but only if a
  real use case appears in the same change. Don't speculate — stop
  here otherwise.
- Centralize type coercion so substituted templates flow through one
  place that knows how to convert/validate per declared type.

### 4. Isolation guarantees

- Every simtest runs with:
  - a fresh `ctx` (no shared state),
  - cwd reset to the repo root at start,
  - a private `cleanups` stack,
  - an env snapshot taken at start and restored at end if any action
    mutated `process.env` (none in plan 01, but the guarantee is
    cheap and forward-compatible).
- Add a meta-simtest `meta_isolation.simtest.yaml` that:
  1. runs an action that creates a marker file under a tmp dir,
  2. asserts the file exists during the simtest,
  3. ends.

  And a second meta-simtest that asserts the marker from #1 is gone.
  Run together they prove cleanup ran.

### 5. Meta-testing the runner

A small set of meta-simtests covers the runner itself. These live in
`src/__simtest__/meta/` (or a `meta_` prefix — pick one and stick to
it).

- **`meta_assert_failure`** — uses an intentionally false `assert:`
  and is run via a harness that expects failure. The harness can be a
  plain `bun:test` file that calls `runSimtest` and asserts
  `ok === false` with the expected step index.
- **`meta_template_missing`** — references an unbound
  `${{ steps.nope }}`; expect a load-time or run-time error naming
  `nope`.
- **`meta_action_missing_input`** — omits a required input; expect
  a validation error naming the field.
- **`meta_action_unknown`** — calls an undeclared action; expect a
  validation error naming the action.

These exist specifically to keep the runner honest. They are *the*
regression net for the system.

### 6. CI integration

- Add a `simtest` script to `package.json` that runs
  `./cmd simtest run`.
- Wire it into whatever CI invokes the rest of the verification (bun
  test, lint, typecheck). Until CI exists in this repo, document the
  intended invocation in `docs/system/simtest/README.md`'s "Running"
  section so it lands when CI does.

### 7. Reporting

- CLI gains a non-default `--json` mode that prints one JSON object
  per simtest with `{ name, ok, durationMs, steps: [...] }`. No new
  formats beyond `human` and `json`. Resist tables, colors-by-default,
  spinners.
- Always print a final summary: `<n> passed, <m> failed in <t>ms`.

### 8. Performance hygiene

- Measure and log each step's duration in the structured result so
  slow actions are visible. No optimization work in this plan —
  measurement only.

## Explicitly out of scope

- Parallelism (saved for a later plan if/when serial execution is
  measurably too slow).
- Container-backed actions.
- Action composition / sub-simtests.
- Custom user-defined matchers beyond the built-in assertion set.
- Any new domain action (git, fs, http) that isn't required to
  implement the items above.

## Risks

- **Validation creep.** Strict schema validation is valuable; a
  full JSON-Schema engine is not. Hand-roll the validator. It's a
  few hundred lines. See
  [`make-it-easy`](../../../principles/make-it-easy.md) — build the
  substrate the suite actually needs.
- **Meta-simtest tangling.** Meta tests run the runner; if the
  runner breaks, they break. Keep the harness in plain `bun:test`
  so a runner regression is still surfaced by a normal test, not
  by a self-referential simtest that can't load.
- **Reporter sprawl.** Two formats only. Anything more is a sign
  the format is wrong, not that another one is needed.
