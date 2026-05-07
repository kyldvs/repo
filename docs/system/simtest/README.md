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
.config/sim.yaml                       # action catalog (single source of truth)
src/__simtest__/<name>.simtest.yaml    # individual simtests
docs/system/simtest/                   # this documentation
```

Simtests live next to source under `__simtest__/`. The `.simtest.yaml`
suffix distinguishes them from config and makes discovery trivial.

Simtest is the repo's sole verification system. There is no separate
repotest layer — container-backed isolation, when needed, is provided
by container-backed *actions* (see plan 03).

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

## Running a simtest

> Implementation lands in plan `01-impl.md`. The intended surfaces:
>
> - `./cmd simtest run <path>` — run a single simtest file.
> - `./cmd simtest run` — discover and run every `*.simtest.yaml`
>   under `src/`.
> - `bun test` — simtests are also wired into the bun test runner so
>   they participate in normal CI.

Each simtest is independent: failures in one do not abort others.

## Authoring

### A new simtest

1. Create `src/__simtest__/<name>.simtest.yaml`.
2. Set `name` and `desc`.
3. Compose `steps` from actions declared in `.config/sim.yaml`.
4. Run it locally with `./cmd simtest run`.

If you need a primitive that doesn't exist yet, add an action — don't
inline shell.

### A new action

1. Add the declaration to `.config/sim.yaml` with its `desc`, typed
   `input`, and typed `output`.
2. Implement it in the action registry. The implementation must
   accept the declared inputs and produce the declared outputs.
3. Add at least one simtest (or extend an existing one) that
   exercises the action — actions without coverage are dead code.

### A new assertion

Assertions are a parallel registry. Add the implementation, give it a
short, predicate-style name (`dir_exists`, `is_clean`,
`file_contains`), and document the inputs it accepts. Any assertion
should be safe to use under both `assert:` and `assert_not:`.

## Hermetic execution

Simtests run on the host by default. When a scenario needs the same
isolation guarantees a container provides — pristine env, no host
caches, exact toolchain pinning — it composes container-backed
actions (e.g. `podman_run`) rather than living in a separate test
system. Plan 03 covers when those actions land.
