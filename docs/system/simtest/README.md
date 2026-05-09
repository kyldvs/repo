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
.config/sim.yaml                       # action + assertion catalog (single source of truth)
src/__simtest__/<name>.simtest.yaml    # individual simtests
src/cli/sim/action/<name>.ts           # one file per action
src/cli/sim/assert/<name>.ts           # one file per assertion
src/cli/sim/protocol.ts                # JSON I/O + catalog validation
src/cli/sim/run.ts                     # the simtest runner
src/cli/cmd/sim_action/main.ts         # ./cmd sim_action <name> <in> <out>
src/cli/cmd/sim_assert/main.ts         # ./cmd sim_assert <name> <in> <out>
src/cli/cmd/simtest/main.ts            # ./cmd simtest run [path]
tmp/sim/                               # runtime temp dir (gitignored)
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
desc: "Sets up the 'repo' repo and makes sure everything works"

steps:
  - action: get_main_hash
    output:
      hash: main_hash
  - action: clone_self
    input:
      hash: ${{ steps.main_hash }}
    output:
      dir: clone_dir
  - action: cd
    input:
      path: ${{ steps.clone_dir }}
  - assert_not: dir_exists
    input:
      path: node_modules
  - action: bun_install
  - assert: dir_exists
    input:
      path: node_modules
  - assert: is_clean
```

Top-level fields:

- `name` — short identifier, unique per file.
- `desc` — what this simtest verifies.
- `steps` — ordered list. Each step is an action call or an assertion.

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

- **Working directory** — modified by `cd`, used as the implicit cwd
  for actions like `bun_install`.
- **Step variables** — the bindings produced by `output:` blocks.
- **Cleanup hooks** — temp directories created by actions like
  `clone_self` are tracked and removed when the simtest finishes,
  pass or fail.

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
  simtest on stdout (`{ name, path, ok, durationMs, steps, error? }`).
  The summary line goes to stderr so stdout stays parseable.
- `bun test` — simtests are also wired into the bun test runner so
  they participate in normal CI.
- `bun run simtest` — package-script wrapper that calls
  `./cmd simtest run`. CI should invoke this alongside `bun run
  typecheck`, `bun run lint`, and `bun test`.

Each simtest is independent: failures in one do not abort others.
Each run gets its own `tmp/sim/<run-id>/` directory; it is cleaned
up at the end of the run, pass or fail.

When a simtest fails, the runner prints a structured report:

```
FAIL <simtest> :: step #<n> <kind> <name>
  file:   <simtest path>
  cwd:    <ctx.cwd at the failing step>
  inputs: { ... }                # templates expanded
  stderr: <last 4 KiB>           # only when present
  cause:  <message>
```

The same `SimtestError` envelope is used by `bun test` failure
messages — there is one formatter, no parallel print paths.

## Authoring

### A new simtest

1. Create `src/__simtest__/<name>.simtest.yaml`.
2. Set `name` and `desc`.
3. Compose `steps` from actions declared in `.config/sim.yaml`.
4. Run it locally with `./cmd simtest run`.

If you need a primitive that doesn't exist yet, add an action — don't
inline shell.

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

## Hermetic execution

Simtests run on the host by default. When a scenario needs the same
isolation guarantees a container provides — pristine env, no host
caches, exact toolchain pinning — it composes container-backed
actions (e.g. `podman_run`) rather than living in a separate test
system. Plan 04 covers when those actions land.

## Gotchas

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
