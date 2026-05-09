# Simtest

Simtest is a declarative system for **simulating sequences of repo
operations** — cloning, installing, building, asserting state — and
running them as tests. It exists so that anything we claim about the
repo (it clones cleanly, `bun install` reaches a clean tree, the
template can bootstrap a fresh repo) is expressed as a runnable script
rather than tribal knowledge.

A *simtest* is a YAML file that names a sequence of *actions* and
*assertions*. Each action has a typed input/output contract declared
once in `.config/sim.yaml`. Executing a simtest produces a verifiable
pass/fail.

## Why

The repo's verification rule (`CLAUDE.md`) requires that every claim
be reproducible from a clean state. Hand-written shell scripts and
ad-hoc test files drift quickly: they intermix orchestration with
implementation, embed paths, and resist reuse.

Simtest splits the two concerns:

- **Actions** are reusable, typed primitives implemented once in code.
- **Simtests** are declarative pipelines that compose actions to
  describe a scenario.

The same action library backs normal verification (e.g. "fresh clone
installs cleanly") and meta-testing (e.g. "the simtest runner itself
behaves correctly when an assertion fails").

## File layout

```
.config/sim.yaml                       # action + assertion + environment catalog (single source of truth)
src/__simtest__/<name>.simtest.yaml    # individual simtests
src/cli/sim/action/<name>.ts           # one file per action
src/cli/sim/assert/<name>.ts           # one file per assertion
src/cli/sim/environment/<name>.ts      # one file per environment
src/cli/sim/protocol.ts                # JSON I/O + catalog validation
src/cli/sim/run.ts                     # the simtest runner
src/cli/cmd/sim_action/main.ts         # ./cmd sim_action <name> <in> <out>
src/cli/cmd/sim_assert/main.ts         # ./cmd sim_assert <name> <in> <out>
src/cli/cmd/simtest/main.ts            # ./cmd simtest run [path]
tmp/sim/<run-id>/                      # per-run temp dir (gitignored, wiped at end of run)
docs/system/simtest/                   # this documentation
```

Simtests live next to source under `__simtest__/`. The `.simtest.yaml`
suffix distinguishes them from config and makes discovery trivial.

Simtest is the repo's sole verification system. There is no separate
repotest layer — container-backed isolation, when needed, is provided
by container-backed *actions* (see plan 04).

## Principles in play

Simtest exists because the repo's principles demanded it:

- [Verify](../../principles/verify.md) — every claim must be
  reproducible from a clean state.
- [Declarative](../../principles/declarative.md) — scenarios are data;
  the runner is the only place that knows *how* to execute.
- [Compose](../../principles/compose.md) — actions are typed
  primitives; simtests compose them.
- [Make it easy](../../principles/make-it-easy.md) — the runner is the
  substrate that makes adding new verification cheap.
- [One language](../../principles/one-language.md) — actions and the
  runner are TypeScript on Bun; YAML is data, not a parallel runtime.

## Concepts

### Action

An action is a named, typed operation. The catalog at
`.config/sim.yaml` declares every action that simtests are allowed to
call. A declaration looks like:

```yaml
actions:
  bun_install:
    desc: "Run bun install from cwd"
    input:
      frozen_lockfile:
        desc: "--frozen-lockfile"
        type: bool
        default: true
    output: {}
```

Fields:

- `desc` — one-line human description.
- `input` — map of input names to `{ desc, type, default? }`.
- `output` — map of output names to `{ desc, type }`.

Supported `type` values (initially): `string`, `path`, `bool`. Inputs
with a `default` are optional at the call site; inputs without a
default are required.

The catalog is purely declarative. Action *implementations* live in
code and are looked up by name when a simtest runs. The catalog is
authoritative: an implementation that doesn't match the declared
contract is a bug; a simtest that calls an undeclared action fails to
load.

### Simtest

A simtest is a single YAML file describing one scenario:

```yaml
name: "setup"
desc: "Verifies the local_clone environment delivers a clean, ready working tree"

environment: local_clone
tags: [host, fast]

test:
  - assert: dir_exists
    input:
      path: node_modules
  - assert: is_clean
```

Top-level fields:

- `name` — short identifier, unique per file.
- `desc` — what this simtest verifies.
- `environment` — the environment to run the test in. Optional; defaults
  to `local`. Must name a declaration in `.config/sim.yaml` under
  `environments:`.
- `tags` — optional list of strings used for selection at the CLI and in
  `bun test`. Pure selection; tags do not imply environment behavior.
- `test` — ordered list of steps for the test phase. Each step is an
  action call or an assertion.

The schema has exactly two phases — environment setup (owned by the
named environment) and the test phase (the `test:` list). There is no
`steps:`, no `preflight:`, no `pretest:`, no `setup:`. A simtest with
any of those keys fails to load.

### Phases / Environments

A simtest has two concepts:

1. **Environment** — declarative, named, catalog-declared. It owns the
   bootstrapping required to give the test phase a clean place to run
   (clone, install, container plumbing). The simtest never repeats this.
2. **Test** — the steps that verify the property the simtest claims.
   Test-phase steps run on the host with `cwd` set to the directory the
   environment returned.

Three environments ship today:

- `local` — operates in the current repo working tree (no setup).
- `local_clone` — fresh clone in `tmp/sim/<run-id>/clone`, then
  `bun install --frozen-lockfile` on the host. Requires `git`, `bun`.
- `pod_clone` — fresh clone in `tmp/sim/<run-id>/clone`, then
  `bun install --frozen-lockfile` inside `oven/bun:<version>-alpine`
  bind-mounting the clone. Requires `git`, `docker`. The container runs
  as the host user so the resulting `node_modules` is host-readable;
  test-phase steps still run on the host against the same path.

Each environment declares a flat `requires:` list of CLI commands. The
runner verifies them against `PATH` before calling `setup()`. Anything
more elaborate (env vars, kernel features, network reachability) is
not part of an environment until a real consumer needs it.

### Outcomes

Outcomes are exactly `pass | fail | error`:

- `pass` — every step held.
- `fail` — a test-phase step failed. The structured error carries
  `phase: "test"`.
- `error` — the environment couldn't deliver. Missing required CLI,
  environment setup throw, validation failure: all `error`. The
  structured error carries `phase: "environment"`.

Both `fail` and `error` exit non-zero. There is no skip outcome. There
is no `--strict` flag. Loudness is the default and only mode.

### Tags and selection

Top-level `tags: [...]` is the only "don't run this" lever. The
runner has no `--only`, no `--filter`. Selection happens at discovery
time; a non-selected simtest is not loaded, not validated, and does not
appear in per-run output beyond the `<f> filtered` count in the
summary.

CLI:

- `./cmd simtest run --tag <name>` — keep simtests tagged `<name>`.
  Multiple `--tag` flags are OR-combined.
- `./cmd simtest run --exclude <name>` — drop simtests tagged
  `<name>`. Multiple `--exclude` flags are AND-combined (any match
  drops). Include filter applies first, then exclude.
- No flags = run everything.

`bun test` reads `SIMTEST_TAG` and `SIMTEST_EXCLUDE` (comma-separated)
and registers filtered-out simtests with `test.skip` so they still
appear in the bun-test summary. `test.skip` is for tag-filtered
simtests only — never for missing requirements or environment failures.

Reserved tag conventions (documented, not enforced):

- `fast` — runs in well under a second on a warm host.
- `slow` — multi-second; safe to skip on tight loops.
- `host` — runs entirely on the host; no container needed.
- `container` — needs a container runtime.
- `meta` — exercises the runner itself; not a product test.

### Step

Every step is one of three shapes:

**Action call**

```yaml
- action: <name>
  input: { ... }      # optional, must satisfy the action's input schema
  output: { ... }     # optional, binds named outputs to step variables
```

Inputs are matched by name against the action's declared `input`. Each
value is either a literal of the expected type or a template
expression. Outputs map declared output names to **step variable
names** that subsequent steps can reference.

**Positive assertion**

```yaml
- assert: <name>
  input: { ... }
```

Runs the assertion. Fails the simtest if the assertion does not hold.

**Negative assertion**

```yaml
- assert_not: <name>
  input: { ... }
```

Runs the assertion and fails the simtest if it *does* hold. Any single
assertion can be used either way.

### Templates

Step inputs may reference previously bound variables with
`${{ steps.<name> }}`. Substitution happens before the input is
type-checked; the bound value must match the declared input type.

```yaml
- action: get_main_hash
  output:
    hash: main_hash         # binds output 'hash' -> variable 'main_hash'

- action: clone_self
  input:
    hash: ${{ steps.main_hash }}   # references the variable
  output:
    dir: clone_dir
```

Variables share a single flat namespace per simtest. Re-binding a name
overwrites it.

### Execution state

While a simtest runs, the executor tracks:

- **Working directory** — initialized to the path the environment
  returned (e.g. the cloned tree under `local_clone`); modified by
  `cd`; used as the implicit cwd for test-phase actions.
- **Step variables** — the bindings produced by `output:` blocks.
- **Run directory** — `tmp/sim/<run-id>/`. Anything an environment
  writes (clone, install state) lives here and is removed when the
  simtest finishes, pass or fail.

## Action protocol

Every action and assertion is a standalone file invoked the same way:

```
./cmd sim_action <name> <path/to/input.json> <path/to/output.json>
./cmd sim_assert <name> <path/to/input.json> <path/to/output.json>
```

The dispatcher reads input, validates it against the catalog
declaration, calls the action's `run()`, validates the output, and
writes it. A non-zero exit means the action crashed; an assertion's
"did not hold" outcome is signaled in the output JSON
(`{ ok: false, message?: string }`), not via the exit code.

This means any action is debuggable in isolation:

```sh
mkdir -p tmp/sim
echo '{}' > tmp/sim/in.json
./cmd sim_action get_main_hash tmp/sim/in.json tmp/sim/out.json
cat tmp/sim/out.json   # { "hash": "..." }
```

The simtest runner uses the same interface — it generates JSON
files under a per-run subdirectory of `tmp/sim/` and spawns the
dispatcher for each step.

See plan `01-actions.md` for the contract; plan `02-runner.md` for
how the runner composes actions.

## Running a simtest

- `./cmd simtest run <path>` — run a single simtest file.
- `./cmd simtest run` — discover and run every `*.simtest.yaml`
  under `src/`.
- `./cmd simtest run --json` — same, but emit one JSON object per
  simtest on stdout
  (`{ name, path, outcome, ok, environment, tags, durationMs, steps, error? }`).
  The `error` object includes `phase` (`"test" | "environment"`) on
  non-pass outcomes. The summary line goes to stderr so stdout stays
  parseable.
- `./cmd simtest run --tag <t>` / `--exclude <t>` — filter by tag (see
  "Tags and selection" above).
- `bun test` — simtests are also wired into the bun test runner so
  they participate in normal CI. Set `SIMTEST_TAG` / `SIMTEST_EXCLUDE`
  (comma-separated) to filter.
- `bun run simtest` — package-script wrapper that calls
  `./cmd simtest run`. CI should invoke this alongside `bun run
  typecheck`, `bun run lint`, and `bun test`.

Each simtest is independent: failures in one do not abort others.
Each run gets its own `tmp/sim/<run-id>/` directory; it is cleaned
up at the end of the run, pass or fail.

The summary line is always printed (stdout in human mode, stderr in
JSON mode):
`<n> passed, <m> failed, <e> errored[, <f> filtered] in <t>ms`. The
process exits 0 only when every selected simtest passed.

When a test-phase step fails, the runner prints:

```
FAIL <simtest> :: test step #<n> <kind> <name>
  file:   <simtest path>
  cwd:    <ctx.cwd at the failing step>
  inputs: { ... }                # templates expanded
  stderr: <last 4 KiB>           # only when present
  cause:  <message>
```

When an environment can't deliver — missing CLI, setup throw, schema
validation — the runner prints:

```
ERROR <simtest> :: environment <env-name>
  file:   <simtest path>
  cwd:    <process cwd at the time>
  inputs: {}
  cause:  <message>
```

The same `SimtestError` envelope is used by `bun test` failure
messages — there is one formatter, no parallel print paths.

## Authoring

### A new simtest

1. Create `src/__simtest__/<name>.simtest.yaml`.
2. Set `name`, `desc`, `environment`, and (optionally) `tags`.
3. Compose `test:` from actions and assertions declared in
   `.config/sim.yaml`.
4. Run it locally with `./cmd simtest run`.

If you need a primitive that doesn't exist yet, add an action — don't
inline shell. If three or more simtests share the same setup, consider
adding an environment instead.

### A new action

1. Add the declaration to `.config/sim.yaml` under `actions:` with
   its `desc`, typed `input`, and typed `output`.
2. Create `src/cli/sim/action/<name>.ts` exporting
   `run(input): Promise<output>`. The implementation must accept the
   declared inputs and produce the declared outputs.
3. Add at least one simtest (or extend an existing one) that
   exercises the action — actions without coverage are dead code.

All three land in the same change. The catalog parity check rejects
declarations without files and files without declarations.

### A new assertion

Assertions are a parallel registry under `.config/sim.yaml`'s
`asserts:` block. Add the declaration with its inputs, then create
`src/cli/sim/assert/<name>.ts` exporting
`run(input): Promise<{ ok: boolean; message?: string }>`.

Give it a short, predicate-style name (`dir_exists`, `is_clean`,
`file_contains`). Any assertion should be safe to use under both
`assert:` and `assert_not:`.

### A new environment

1. Add the declaration to `.config/sim.yaml` under `environments:` with
   its `desc` and a flat `requires:` list of CLI commands.
2. Create `src/cli/sim/environment/<name>.ts` exporting
   `setup({ runDir, repoRoot }): Promise<{ cwd: string }>`. Side
   effects must live under `runDir`; the runner's per-run cleanup is
   the contract.
3. Migrate at least one simtest to use it; an environment without a
   consumer is dead weight.

The catalog parity check rejects declarations without files and files
without declarations. Don't add a fourth environment until the third
earns its keep with a real consumer.

## Hermetic execution

Most simtests pick `local_clone` or `pod_clone` for hermeticity: each
gets a fresh clone under `tmp/sim/<run-id>/clone/` and a fresh
`bun install`, with cleanup wiping the run directory at the end pass
or fail.

`pod_clone` is the canonical container-backed scenario: clone the
repo, install inside a stock `oven/bun:<version>-alpine` container,
then run the test phase on the host against the cloned tree. The
container runs as the host user (`--user $(id -u):$(id -g)`) so
files written into the bind-mount stay owned by the host user and
host-side assertions like `is_clean` still work afterwards. Running
`pod_clone` simtests requires `docker` on `PATH` and a reachable
daemon; the image is pulled on first use.

For ad-hoc scenarios that don't fit a canned environment, the
`docker_run` action remains available to run a shell script inside a
container with a single bind-mount, returning captured stdout and
stderr. Non-zero exit fails the step; the runner attaches the
captured stderr to the structured `SimtestError`.

```yaml
- action: docker_run
  input:
    image: oven/bun:1.3.12-alpine
    script: bun install --frozen-lockfile
    mount_src: ${{ steps.clone_dir }}
    mount_dst: /work
```

An environment is the right call when three or more simtests share a
setup; `docker_run` is the right call when a single simtest needs an
ad-hoc bootstrap.

## Gotchas

- Don't write `steps:`, `preflight:`, `setup:`, or `pretest:` at the
  top level. The schema is `environment` + `test`; legacy keys fail to
  load.
- Don't reintroduce a skip outcome under any name. Missing requires and
  broken environments are ERROR; suites opt out by tag, not by silently
  skipping.
- Don't make environment selection imply tags or vice versa.
  `environment: pod_clone` does not auto-tag `container`. Keep them
  orthogonal.
- Don't put environment side effects outside `runDir`. Per-run cleanup
  is the contract.
- Don't add a fourth environment until the third earns its keep with at
  least one real consumer.
- Don't inline shell in a simtest — if a primitive doesn't exist, add
  an action. Inline shell breaks composition and hides intent.
- Don't call an undeclared action. A simtest that references something
  not in `.config/sim.yaml` fails to load; that's intentional.
- Don't drift implementation from declaration. The catalog is
  authoritative; an implementation whose inputs/outputs disagree with
  the catalog is a bug.
- Don't share state between simtests. Each simtest gets a fresh
  context; relying on residue from another run is a guarantee
  violation, not a feature.
- Don't write a parallel test system for "this one weird case". Extend
  the action catalog. Simtest is the only verification system here.
- Don't ship an action without a simtest that exercises it. Uncovered
  actions are dead code.
- Don't compose with `${{ steps.x }}` mid-string in this revision —
  whole-string substitution only (plan 02). Concat and nested
  expressions wait for a real use case.
- Don't clone the working tree to test "the current state".
  `clone_self` clones from origin at a specific hash; uncommitted
  changes are invisible by design.
- Don't bypass the action dispatcher. Every caller — human, runner,
  future tooling — invokes actions via `./cmd sim_action <name>
  <in> <out>`. No imports across action files; no in-process
  shortcuts (until plan 04 explicitly enables one).
- Don't put action I/O JSON or scratch state outside `tmp/sim/`.
  Everything ephemeral lives there so cleanup is one `rm -r` and so
  it's already gitignored.
