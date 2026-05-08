# Plan 03 — Maturation

Goal: turn the working runner from plan 02 into something safe to
rely on across many simtests. Focus is correctness, diagnosability,
and isolation — not new actions.

Pre-req: plan 02 complete.

## Relevant docs

- [verify](../../../principles/verify.md) — meta-tests below verify
  the runner itself; the rule "every claim is reproducible" applies
  to the harness as much as the features it checks.
- [declarative](../../../principles/declarative.md) — schema
  validation is itself declarative (catalog drives it); resist
  hand-written conditionals.
- [compose](../../../principles/compose.md) — diagnostics are a
  formatter that consumes a structured `SimtestError`; not a print
  scattered through the runner.
- [make-it-easy](../../../principles/make-it-easy.md) — hand-roll
  the validator. JSON Schema is more weight than this needs.
- [gotchas](../../../principles/gotchas.md) — every tightening here
  earns a counter-example to keep the guidance sharp.
- Existing systems touched: the runner from plan 02; the protocol
  module from plan 01; CI configuration (when it lands).

## Definition of done

- A failing simtest produces a report that points at the exact step,
  the resolved inputs (templates expanded), captured stderr from the
  subprocess, and the underlying error — with no stack-trace
  archaeology required.
- Two simtests run back-to-back share **no** filesystem state, env,
  or cwd. Verified by a meta-simtest pair.
- Catalog and simtest schemas have explicit validation with errors
  that name the offending field and file path.
- The runner is itself covered by meta-tests (see below).
- CI runs `./cmd simtest run` as a required step.
- Per-step durations appear in the structured result.

## Areas

### 1. Diagnosable failures

- **Structured error.** `runSimtest` returns a `SimtestError` with:
  simtest name, step index, step kind (`action` / `assert` /
  `assert_not`), step identifier, resolved inputs (templates
  expanded), captured stderr from the subprocess (truncated to a
  sane size, e.g. 4 KiB), and the wrapped cause.
- **Pretty printer.** A single formatter renders a `SimtestError`
  consistently for the CLI and for `bun test` failure messages:

  ```
  FAIL <simtest> :: step #<n> <kind> <name>
    cwd:    <ctx.cwd>
    inputs: { ... }
    stderr: <last 4 KiB>
    cause:  <message>
  ```

- **No silent step failures.** The dispatcher (plan 01) already
  exits non-zero with stderr; the runner already captures it
  (plan 02). Plan 03 ensures every failure path lands in the
  formatter — no `console.log` shortcuts.

### 2. Strict schema validation

- Promote plan 01's per-field validator and plan 02's structural
  validator into a single `validateCatalog` / `validateSimtest`
  pair that:
  - rejects unknown top-level keys,
  - rejects unknown step keys,
  - rejects unknown input/output keys per action,
  - validates `type` values against the supported set,
  - rejects defaults whose type doesn't match.
- Errors include `file:line` when possible (the `yaml` package
  exposes positions on parsed nodes — wire them through). When a
  position is unavailable, fall back to `<file>:<field-path>`.

### 3. Type coverage

- Add `int` and `string[]` to the supported type set, but only if a
  real action or assertion in this plan needs them. Don't speculate
  — stop here otherwise.
- Centralize coercion so that substituted templates flow through
  one place that knows how to convert/validate per declared type.

### 4. Isolation guarantees

- Every simtest runs with:
  - a fresh `ctx` (no shared state),
  - cwd reset to the repo root at start,
  - its own `tmp/sim/<run-id>/` (already in plan 02; verify),
  - an env snapshot taken at start and restored at end if any
    action mutated `process.env` (none in plan 01–02, but the
    guarantee is cheap and forward-compatible).
- Add a meta-simtest pair under `src/__simtest__/meta/`:
  1. `meta_isolation_a.simtest.yaml` — creates a marker file under
     a tmp path produced by an action; asserts it exists during
     the simtest; ends.
  2. `meta_isolation_b.simtest.yaml` — runs immediately after; the
     bun-test harness asserts the marker from #1 is gone.

  Together they prove cleanup ran. The pairing is enforced by the
  harness, not by simtest ordering.

### 5. Meta-testing the runner

A small set of meta-tests covers the runner itself. These live in
`src/__simtest__/meta/` (or a `meta_` prefix — pick one and stick to
it).

- **`meta_assert_failure`** — uses an intentionally false `assert:`,
  run via a plain `bun:test` that calls `runSimtest` and expects
  `ok === false` with the expected step index.
- **`meta_template_missing`** — references unbound
  `${{ steps.nope }}`; expects a load- or run-time error naming
  `nope`.
- **`meta_action_missing_input`** — omits a required input;
  expects a validation error naming the field.
- **`meta_action_unknown`** — calls an undeclared action; expects
  a validation error naming the action.
- **`meta_subprocess_crash`** — calls an action that exits non-zero
  with a known stderr message; the test asserts the runner's
  formatted error contains the stderr.

These exist specifically to keep the runner honest. They are *the*
regression net for the system. Keep the harness in plain
`bun:test` so a runner regression is still surfaced by a normal
test, not by a self-referential simtest that can't load.

### 6. CI integration

- Add a `simtest` script to `package.json` that runs
  `./cmd simtest run`.
- Wire it into whatever CI invokes the rest of the verification
  (bun test, lint, typecheck). Until CI exists in this repo,
  document the intended invocation in
  `docs/system/simtest/README.md`'s "Running" section so it lands
  when CI does.

### 7. Reporting

- CLI gains a non-default `--json` mode that prints one JSON object
  per simtest: `{ name, ok, durationMs, steps: [...] }`. No new
  formats beyond `human` and `json`. Resist tables, colors-by-default,
  spinners.
- Always print a final summary: `<n> passed, <m> failed in <t>ms`.

### 8. Performance hygiene

- Measure and log each step's duration in the structured result so
  slow actions are visible. No optimization work in this plan —
  measurement only.
- The expected hot path: per-step subprocess startup (Bun cold
  start). If that's the dominant cost, plan 04 may add an in-process
  invocation mode for actions known to be hot. Decide based on
  data.

## Explicitly out of scope

- Parallelism (plan 04 if/when serial execution is measurably too
  slow).
- Container-backed actions (plan 04).
- Action composition / sub-simtests / includes (plan 04).
- Custom user-defined matchers beyond the built-in assertion set.
- Any new domain action (git, fs, http) that isn't required to
  implement the items above.

## Risks

- **Validation creep.** Strict schema validation is valuable; a
  full JSON-Schema engine is not. Hand-roll it. See
  [`make-it-easy`](../../../principles/make-it-easy.md).
- **Meta-test tangling.** Meta tests run the runner; if the
  runner breaks, they break. Keep the harness in plain `bun:test`
  so a runner regression is still surfaced by a normal test, not
  by a self-referential simtest that can't load.
- **Reporter sprawl.** Two formats only. Anything more is a sign
  the format is wrong, not that another one is needed.
- **Diagnostics drift.** stderr is captured at the dispatcher and
  again at the runner. Make sure the formatter prints it once,
  with the dispatcher layer responsible for the message and the
  runner layer responsible for the structured envelope.

## Gotchas

- Don't add a fancier validation library when a hand-rolled
  validator is one screen of code. The catalog schema barely
  changes; complexity here is overhead forever.
- Don't print errors mid-run. Errors flow through the structured
  envelope and out the formatter. `console.log` in the runner is
  a smell.
- Don't share state between meta-tests. The whole point of the
  isolation pair is to prove that nothing crosses simtest
  boundaries; cute test-level globals defeat that.
- Don't write a meta-simtest that depends on running before
  another. Order is not a feature.
