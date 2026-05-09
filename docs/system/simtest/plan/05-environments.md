# Plan 05 — Environments

Goal: factor *what runs* from *where it runs*. A simtest declares
**what** to verify; an **environment** delivers a clean place to
verify it. A simtest then has three top-level keys — `environment`,
`test`, `tags` — and nothing else.

Pre-req: plan 04 complete.

## Relevant docs

- [declarative](../../../principles/declarative.md) — environments
  are *named*, *catalog-declared* primitives. Picking one is a
  data choice.
- [compose](../../../principles/compose.md) — an environment is a
  leaf with a narrow contract (`setup() → { cwd }`); composition
  lives in simtests.
- [make-it-easy](../../../principles/make-it-easy.md) — three
  environments, one phase, plain-English names. No `preflight`,
  no `pretest`, no `setup` — each was tried in a draft and removed.
- [verify](../../../principles/verify.md) — a missing dependency
  is not "skip and move on". It is a loud ERROR. Quiet skips
  green-wash CI; this plan refuses to ship them.
- [look-before-leap](../../../principles/look-before-leap.md) — the
  schema change touches `loadSimtest` (plan 02), `validateSimtest`
  (plans 02–03), the formatter (plan 03), and discovery (plan 02).
  Read those before editing.
- Existing systems touched: the simtest YAML schema; the loader,
  validator, runner, formatter, CLI, and `_runner.test.ts` harness;
  every existing `*.simtest.yaml` (migration is part of this plan).

## Definition of done

- A simtest declares its environment with a top-level
  `environment: <name>` key. `environment` defaults to `local`.
- The single execution phase is `test:`. `steps:` no longer loads.
  No `preflight`, `pretest`, or `setup` phase exists.
- Three environments ship with this plan: **`local`**,
  **`local_clone`**, **`pod_clone`**. Each has a catalog
  declaration, an implementation file, and at least one simtest
  that uses it.
- Environments are catalog-declared. The parity check (plan 01)
  extends to `environments:` ↔ `src/cli/sim/environment/<name>.ts`.
- Each environment declares a `requires:` list of CLI commands.
  Missing requirement → simtest returns **ERROR** with the missing
  command(s) named in the cause. Environment setup that fails
  after requirements pass → ERROR with the underlying cause.
- Outcomes are exactly `pass | fail | error`. Both `fail` and
  `error` exit non-zero. There is **no skip** outcome and no
  `--strict` flag. The runner always fails loudly; if a suite
  shouldn't run a class of simtest at all, it filters by tag.
- Failure errors carry `phase: "test"`; ERROR errors carry
  `phase: "environment"`. The phase appears in the human report
  header and the JSON output.
- Top-level `tags: [a, b]` is supported. CLI selectors `--tag` and
  `--exclude` work for `./cmd simtest run`. `bun test` honors the
  same filter via `SIMTEST_TAG` / `SIMTEST_EXCLUDE`.
- Reporter distinguishes PASS, FAIL, ERROR. Final summary:
  `<n> passed, <m> failed, <e> errored[, <f> filtered] in <t>ms`.
- Every existing simtest is migrated. The result is dramatically
  shorter — most simtests collapse to four lines of meaningful YAML.

## The environment primitive

An environment is named, declarative, and small. It promises one
thing: a `cwd` you can run a `test:` phase against. It owns
whatever bootstrapping that promise requires (clone, install,
container plumbing). The simtest never has to repeat it.

### Catalog declaration

```yaml
# .config/sim.yaml
environments:
  local:
    desc: "Operate in the current repo working tree"
    requires: []
  local_clone:
    desc: "Fresh clone on the host with bun install run on the host"
    requires: [git, bun]
  pod_clone:
    desc: "Fresh clone with bun install run inside a container against the cloned tree"
    requires: [git, docker]
```

`requires:` is a flat list of CLI commands that must be on `PATH`.
That's the whole gate. Anything more elaborate (env vars,
network reachability, kernel features) waits for a real consumer.

### Implementation contract

`src/cli/sim/environment/<name>.ts` exports:

```ts
export type EnvCtx = { cwd: string };

export async function setup(opts: {
  runDir: string;     // tmp/sim/<run-id>/ — anything the env writes goes here
  repoRoot: string;
}): Promise<EnvCtx>;
```

- `local.setup()` returns `{ cwd: repoRoot }`. No work.
- `local_clone.setup()` clones origin into `runDir/clone`, runs
  `bun install --frozen-lockfile` on the host, returns
  `{ cwd: runDir/clone }`.
- `pod_clone.setup()` clones origin into `runDir/clone`, runs
  `bun install --frozen-lockfile` inside `oven/bun:<version>-alpine`
  bind-mounting the clone, returns `{ cwd: runDir/clone }`.

Notes:

- The clone lives under `runDir`, not in a long-lived
  `tmp/sim/clones/`. The runner's existing per-run cleanup wipes
  it. Each simtest is hermetic by default; cache-style clone reuse
  waits for a real demand.
- `pod_clone` runs the install inside the container as the host
  user (`--user $(id -u):$(id -g)`) so the resulting `node_modules`
  is host-readable and the post-test `is_clean` assertion still
  works against the same path.
- Subsequent test-phase actions still run on the host; only the
  install step runs in the container. Container-routed actions are
  out of scope for this plan.

### Loader / runner integration

- The simtest schema gains `environment: <name>` and loses
  `steps:`. `test:` is required.
- The runner, before executing any `test:` step:
  1. Resolves the environment (default `local`).
  2. Verifies each `requires:` entry against `PATH`. Any missing
     entry → ERROR with cause
     `required CLI not on PATH: <name> (environment <env>)`. If
     multiple are missing, name them all.
  3. Calls `setup({ runDir, repoRoot })` — exceptions become ERROR
     with the underlying message as the cause. The structured
     error has `phase: "environment"` and `environment: <name>`.
  4. Sets `ctx.cwd` to the returned `cwd`. `ctx.vars` start empty.
- Test-phase steps run exactly as today: action / assert /
  assert_not, with `${{ steps.X }}` substitution and `cd` carrying
  cwd. The structured error gets `phase: "test"` for any failure
  here.

## Schema after this plan

```yaml
name: "setup"
desc: "Verifies the local_clone environment delivers a clean ready state"
environment: local_clone
tags: [host, fast]

test:
  - assert: dir_exists
    input:
      path: node_modules
  - assert: is_clean
```

```yaml
name: "setup_container"
desc: "Verifies the pod_clone environment delivers a clean ready state"
environment: pod_clone
tags: [container, slow]

test:
  - assert: dir_exists
    input:
      path: node_modules
  - assert: is_clean
```

```yaml
name: "meta_isolation_a"
desc: "Half of an isolation pair: cwd starts at repo root under local"
environment: local
tags: [meta, fast]

test:
  - assert: dir_exists
    input:
      path: src
```

The `setup` and `setup_container` simtests collapse from
seven-step pipelines to two-assertion contract checks. The
environment now owns the boilerplate; the simtest reads as the
*property* being verified.

## Tags and selection

Tags are the *only* "don't run this" lever. There is no `--only`,
no `--filter`, no `--strict`, no skip outcome. If you don't want
a class of simtest to run on this host, filter it out by tag.

- Top-level `tags: [a, b]` — list of strings.
- Reserved conventions (documented, not enforced):
  - `fast` — runs in well under a second on a warm host.
  - `slow` — multi-second; safe to skip on tight loops.
  - `host` — runs entirely on the host; no container needed.
  - `container` — needs a container runtime.
  - `meta` — exercises the runner itself; not a product test.
- CLI:
  - `./cmd simtest run --tag fast` — include any simtest tagged
    `fast`. Multiple `--tag` flags are OR-combined.
  - `./cmd simtest run --exclude container` — drop simtests
    tagged `container`. Multiple `--exclude` flags are
    AND-combined (any match drops).
  - With both: include filter applies first, then exclude.
  - No flags = run everything.
- `bun test` reads `SIMTEST_TAG` / `SIMTEST_EXCLUDE`
  (comma-separated). The harness in `_runner.test.ts` registers
  filtered-out simtests with `test.skip` so the bun-test summary
  still shows them. **`test.skip` is for tag-filtered simtests
  only** — never for missing requirements or environment failures.
- Selection happens at discovery time. A non-selected simtest is
  not loaded, not validated, and does not appear in the per-run
  output beyond the `<f> filtered` count in the summary.

## Reporting

Outcomes are `pass | fail | error`. Both `fail` and `error` exit
non-zero. The CLI exits 0 only if every simtest passed (or was
filtered out by tags).

Human mode:

- `PASS <name> (<ms>) [tags]`
- `FAIL <name> :: test step #N <kind> <name>` — existing structured
  block with phase header. The cause is the assertion message or
  the action's stderr.
- `ERROR <name> :: environment <env-name>` — same structured block
  shape, but the header names the environment and the cause names
  the missing CLI(s) or the underlying setup error.

JSON mode adds these fields to the existing per-simtest object:
`outcome` (`"pass" | "fail" | "error"`), `environment`, `tags`,
and on non-pass outcomes the existing `error` object now carries
`phase` (`"test" | "environment"`).

Final summary always prints (stdout in human mode, stderr in
JSON mode):
`<n> passed, <m> failed, <e> errored in <t>ms`. If any tag filter
dropped simtests, append `, <f> filtered`.

CI gets loud failures by default. There is no opt-in to loudness;
loudness is the default and only mode.

## Build order

1. Catalog: add `environments:` block. Extend protocol/parity to
   include it. Add the three declarations.
2. Implementations: `src/cli/sim/environment/{local,local_clone,
   pod_clone}.ts`. Each puts side-effects under `runDir` only.
3. Loader: parse `environment:` (default `local`), `test:`,
   `tags:`. Reject `steps:`, `preflight:`, `setup:`, `pretest:`.
4. Validator: catalog-check the environment name; tags must be
   strings.
5. Runner: requirements check → ERROR path; environment setup
   exception → ERROR path with `phase: "environment"`; test phase
   as today with `phase: "test"`. No skip path exists.
6. Formatter / CLI: add outcome, phase, environment, tags to
   human and JSON outputs. Add `--tag` and `--exclude`. Update the
   final summary line. Exit non-zero on any fail or error.
7. `_runner.test.ts`: read `SIMTEST_TAG` / `SIMTEST_EXCLUDE`,
   register filtered-out simtests with `test.skip`. Drop the
   path-based `meta/` filter. Missing requires and environment
   failures throw normally — no `test.skip` for those.
8. Migration: rewrite the four existing simtests and the inline
   fixtures in `src/__simtest__/meta/_runner.test.ts` to the new
   schema. Delete the now-redundant `clone_self` + `cd` +
   `bun_install` boilerplate from those simtests.
9. Meta-tests: ERROR from missing requirement (cause names the
   CLI); ERROR from environment setup failure (cause is the
   underlying error); FAIL inside test phase (`phase = test`);
   tag include/exclude select expected subsets.
10. Docs: update README sections (Phases → Environments;
    new Tags section). The Pre-flight section is *not* added —
    pre-flight is gone.

The loader change and the migration land in the same commit so
`steps:` never half-works.

## Action set after migration

The action `clone_self` and the action `bun_install` were
introduced in plans 01–02 to let `setup.simtest.yaml` express
its scenario step-by-step. After this plan, the same work is
done by `local_clone.setup()` and `pod_clone.setup()` *as code*,
not as YAML composition. Two questions follow:

1. **Do `clone_self` / `bun_install` / `cd` / `docker_run` stay?**
   Yes. They remain valid actions for ad-hoc simtests that don't
   fit a canned environment. An environment is the right call
   when three or more simtests share a setup; an action is the
   right call when a single simtest needs an ad-hoc bootstrap.
   Removing them prematurely would cost more than it saves.
2. **Is there now duplicated logic between actions and
   environments?** Slightly — both call `git clone`. The shared
   piece is small (~10 lines); extract it only if a third caller
   appears. Two callers is a hint, three is a pattern.

## Explicitly out of scope

- A `pretest:` phase. The schema is `environment` + `test`.
  Test-phase steps may include actions before assertions when a
  simtest needs ad-hoc fixture work; that's enough.
- A skip outcome, a `--strict` flag, an `allow-missing` flag, or
  any other implicit "this is fine, move on" path. If something
  is broken or missing, the run errors. Loud always.
- Per-step environment routing (e.g. "this assertion runs inside
  the pod"). Test-phase steps run on the host even under
  `pod_clone`. Container-routed actions wait for a real consumer.
- Custom or simtest-local environments. The catalog is the
  registry; new environments are PRs, not parameters.
- Cross-simtest setup sharing via `include:` (still plan 04
  territory).
- New domain actions or assertions. This plan changes shape, not
  vocabulary.
- A `teardown` phase. The runner already cleans
  `tmp/sim/<run-id>/` and resets cwd/env.
- Caching environment work between simtests (e.g. a shared
  pre-installed clone). Hermeticity beats speed until measurement
  proves otherwise.

## Risks

- **Environment scope creep.** The temptation will be to make
  `local_clone` "also do X" or "take a parameter for Y". Resist:
  if a simtest needs a different shape, add a new environment.
- **`pod_clone` honesty.** The install runs in the container; the
  test runs on host. Document this prominently. A user might
  expect the test to run inside the pod and be surprised when
  `bun --version` reports the host's bun.
- **Migration regression.** Collapsing `setup.simtest.yaml` to two
  asserts looks like a coverage loss. It isn't — the work moved
  to `local_clone.setup()`. The verification surface is the same
  scenario, expressed once and shared.
- **ERROR clarity.** "Setup failed" can mean the requires-check
  failed *or* the clone failed *or* the install failed *or* the
  container failed. The cause string must say which, with names —
  enough that a reader doesn't have to open the env code to know
  what to fix.
- **Pressure to add SKIP back.** A CI host without docker will
  ERROR on `pod_clone` simtests. The right fix is to filter by
  `--exclude container`, not to add a skip outcome that papers
  over missing dependencies. Hold the line.

## Gotchas

- Don't reintroduce `preflight`, `setup`, or `pretest` phases.
  An environment owns environment work; the test phase owns
  verification. Two concepts.
- Don't reintroduce a skip outcome under any name. Missing deps
  and broken environments are ERROR. Tag filters are how a suite
  declines to run a class of simtest.
- Don't make environment selection imply tags or vice versa.
  `environment: pod_clone` does not auto-tag `container`. Keep
  them orthogonal so a simtest can be filtered without reading
  its environment.
- Don't put environment side-effects outside `runDir`. The
  per-run cleanup is the contract.
- Don't add a fourth environment until the third earns its keep
  with at least one real consumer.
- Don't fork the action protocol for environment work.
  Environments are TS modules with their own contract; they are
  not actions and don't pretend to be.
- Don't keep a `steps:` shim "for backwards compatibility." Four
  simtests is not a migration burden; the cost of two ways to
  write a simtest is.
