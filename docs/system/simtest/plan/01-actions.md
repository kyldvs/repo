# Plan 01 — Action and assertion protocol

Goal: lock the **interface** that every action and assertion must
satisfy, and ship the four actions and two assertions used by
`src/__simtest__/setup.simtest.yaml`. Each action is a standalone
file invoked the same way from the CLI. There is no simtest YAML
runner in this plan — that's plan 02.

This plan is deliberately about substrate, not feature. Per
[`make-it-easy`](../../../principles/make-it-easy.md), the protocol
the runner sits on is what makes every later verification cheap.
Per [`interface-planning`](../../../principles/interface-planning.md),
the call site and contract are pinned here so plan 02 has nothing
ambiguous to compose against.

## Relevant docs

- [verify](../../../principles/verify.md) — every action is
  independently runnable from a clean state, so the verification
  surface starts at the action, not the runner.
- [interface-planning](../../../principles/interface-planning.md) —
  this plan is the interface; implementation is the easy part.
- [compose](../../../principles/compose.md) — actions are the typed
  primitives; nothing else in the system is allowed to reach inside
  them.
- [declarative](../../../principles/declarative.md) — the catalog at
  `.config/sim.yaml` is the single source of truth for what an action
  accepts and produces.
- [one-language](../../../principles/one-language.md) — every action
  is TypeScript on Bun, invoked through `./cmd`.
- [make-it-easy](../../../principles/make-it-easy.md) — substrate
  first; locking the protocol now keeps every later action a
  one-file change.
- [look-before-leap](../../../principles/look-before-leap.md) — the
  existing `cmd` dispatcher already routes `./cmd <name>` to
  `src/cli/cmd/<name>/main.ts`; this plan extends that pattern, it
  does not invent a new one.
- Existing systems touched: `.config/sim.yaml` (catalog), `./cmd`
  (CLI entry), `src/__simtest__/setup.simtest.yaml` (the simtest plan
  02 will run).

## Call site (interface)

Every action is invoked the same way:

```
./cmd sim_action <name> <path/to/input.json> <path/to/output.json>
```

Every assertion is invoked the same way:

```
./cmd sim_assert <name> <path/to/input.json> <path/to/output.json>
```

That is the entire interface. A human debugging an action runs:

```sh
mkdir -p tmp/sim
echo '{}' > tmp/sim/in.json
./cmd sim_action get_main_hash tmp/sim/in.json tmp/sim/out.json
cat tmp/sim/out.json   # { "hash": "..." }
```

The simtest runner (plan 02) calls actions the same way — the only
difference is that the runner generates the JSON files under a
per-run subdirectory of `tmp/sim/` and reads the outputs back.

### Action contract

- **Input**: a JSON object whose keys/types match the action's
  declared `input` in `.config/sim.yaml`.
- **Output**: a JSON object whose keys/types match the declared
  `output`.
- **cwd**: the action runs with whatever `process.cwd()` the caller
  provided (the runner sets this; for manual invocation it's the
  shell's cwd).
- **Exit code**: `0` on success; non-zero on failure. stderr carries
  the error message.
- **Side effects**: filesystem only. Actions never mutate caller
  state directly; if the runner needs to update its own state from
  an action's result, it does so by reading the output JSON.

### Assertion contract

Identical to the action contract, with one addition:

- **Output** is fixed: `{ "ok": boolean, "message"?: string }`.
- Exit code is `0` even when `ok: false` — failure is signaled in
  the JSON, not the exit code, so the runner can distinguish
  "assertion did not hold" from "assertion crashed".

This means assertions don't need an `output:` block in the catalog
declaration. They share the same fixed output shape.

## File layout

```
.config/sim.yaml                       # catalog (existing; gains an `asserts:` block)
src/cli/cmd/sim_action/main.ts         # dispatcher: ./cmd sim_action <name> <in> <out>
src/cli/cmd/sim_assert/main.ts         # dispatcher: ./cmd sim_assert <name> <in> <out>
src/cli/sim/protocol.ts                # JSON I/O + catalog validation; types
src/cli/sim/action/<name>.ts           # one file per action
src/cli/sim/assert/<name>.ts           # one file per assertion
tmp/sim/                               # runtime temp dir (gitignored)
```

Each action/assertion file exports a single `run`:

```ts
// src/cli/sim/action/get_main_hash.ts
export async function run(input: Input): Promise<Output> { ... }
```

The dispatcher dynamically imports the file by name, calls `run`,
and handles all JSON I/O and catalog validation. Actions never read
or write files outside their declared inputs/outputs.

## Definition of done

- `./cmd sim_action <name> <in> <out>` works for every action in
  `.config/sim.yaml`.
- `./cmd sim_assert <name> <in> <out>` works for every assertion
  used by `setup.simtest.yaml` (`dir_exists`, `is_clean`).
- Invalid `<name>` exits non-zero, prints `no such action: X` (or
  assertion), and lists the available names.
- Catalog parity check: a load-time check fails if a declared
  action lacks a file, or a file lacks a declaration. Same for
  assertions.
- Each action's input is validated against its declaration before
  `run` is called; output is validated after. Validation errors
  name the field and the file.
- `tmp/` is gitignored.
- Each action and assertion has a `bun:test` smoke test that
  subprocess-invokes the dispatcher and asserts the output shape.

## Scope

In:

- The four actions: `get_main_hash`, `clone_self`, `cd`,
  `bun_install`.
- The two assertions: `dir_exists`, `is_clean`.
- `src/cli/sim/protocol.ts` (read/write JSON, catalog loader,
  per-field validator, shared types).
- The two dispatcher commands.
- The catalog parity check, runnable as `./cmd sim_check` (a thin
  wrapper that invokes the parity logic and exits non-zero on
  mismatch).
- An `asserts:` block added to `.config/sim.yaml` declaring the
  assertion inputs (`dir_exists.path`, `is_clean` takes none).
- `tmp/` added to `.gitignore`.

Out (deferred to plan 02 and beyond):

- Simtest YAML loader.
- `${{ steps.x }}` template substitution (a runner concern — actions
  always receive concrete values).
- Step variable bindings.
- Per-run cleanup orchestration (each action that produces a tmp
  path returns the path; the runner is what tracks and cleans).
- `bun test` integration (depends on the runner).
- Container-backed actions (plan 04).

## Build order

Each step lands as its own commit so failures bisect cleanly.

### 1. Gitignore + tmp dir convention

- Add `tmp/` to `.gitignore`.
- Document in this plan and in `docs/system/simtest/README.md` that
  all action I/O JSON files and any tmp paths actions produce live
  under `tmp/sim/`.

### 2. Catalog: declare assertions

- Extend `.config/sim.yaml` with an `asserts:` block:

  ```yaml
  asserts:
    dir_exists:
      desc: "Assert that a directory exists at path"
      input:
        path:
          desc: "Directory path, resolved against cwd"
          type: path
    is_clean:
      desc: "Assert the working tree is clean (git status --porcelain empty)"
      input: {}
  ```

- Output is implicit (`{ ok, message? }`) and not declared.

### 3. Protocol module

- `src/cli/sim/protocol.ts`:
  - Types: `Type` (`'string' | 'path' | 'bool'`), `IoSpec`,
    `ActionSpec`, `AssertSpec`, `Catalog`.
  - `loadCatalog(): Catalog` — reads `.config/sim.yaml` (uses the
    `yaml` dep already in `package.json`).
  - `readInput(path): unknown` — atomic read + JSON parse.
  - `writeOutput(path, value): void` — atomic write (write to
    `path.tmp`, rename to `path`).
  - `validateInput(spec, raw): Input` — checks every required
    field, rejects unknown fields, coerces `bool`/`path`. Throws
    with a field-level message.
  - `validateOutput(spec, raw)` — same for output.
  - `validateAssertOutput(raw)` — fixed `{ ok, message? }` shape.

The protocol module is the single seam between actions and their
callers. Both dispatchers and the future runner go through it.

### 4. Dispatchers

- `src/cli/cmd/sim_action/main.ts`:
  - Args: `<name> <input> <output>`.
  - Resolve `src/cli/sim/action/<name>.ts`. If missing, list
    available names from the catalog and exit non-zero.
  - Load catalog, read input, validate input, dynamically `import`
    the action file, call `run`, validate output, write output.
  - On thrown error: print message + truncated stack to stderr,
    exit non-zero.
- `src/cli/cmd/sim_assert/main.ts`: same shape, reads from
  `src/cli/sim/assert/<name>.ts`, validates fixed output schema.
- `src/cli/cmd/sim_check/main.ts`: runs the parity check (every
  declared action has a file; every file is declared) and exits
  non-zero on mismatch with a list of differences.

### 5. The four actions

One file per action under `src/cli/sim/action/`:

- `get_main_hash.ts` — runs `git ls-remote origin main`, parses
  the first column of the first line, returns `{ hash }`. No
  inputs.
- `clone_self.ts` — `mkdtemp` under `tmp/sim/clones/` (creating
  parents as needed), `git clone --depth 1 <origin> <dir>`,
  `git -C <dir> checkout <hash>`, return `{ dir }` (absolute path).
  Cleanup of the clone dir is the runner's job — this action only
  produces the path.
- `cd.ts` — resolve `path` against `process.cwd()`, verify it
  exists and is a directory, return `{}`. The runner reads the
  step's input `path` and updates its own cwd; the subprocess is a
  pure validator. (See open question below.)
- `bun_install.ts` — `Bun.spawn(["bun", "install", ...])` in
  `process.cwd()`, with `--frozen-lockfile` controlled by the
  declared input default. Throws on non-zero with stdout + stderr
  attached.

### 6. The two assertions

One file per assertion under `src/cli/sim/assert/`:

- `dir_exists.ts` — resolve `path` against `process.cwd()`; return
  `{ ok: statSync(...).isDirectory() }` if it exists, `{ ok: false,
  message: "expected dir at <path>; not found" }` otherwise.
- `is_clean.ts` — run `git status --porcelain` in `process.cwd()`;
  return `{ ok: stdout.trim() === "" }` with the porcelain output as
  `message` on failure.

### 7. Smoke tests

- `src/cli/sim/__test__/action.test.ts` — one `bun:test` file with a
  `test()` per action that:
  1. writes a known-good input JSON under `tmp/sim/`,
  2. runs `./cmd sim_action <name> <in> <out>` via `Bun.spawn`,
  3. asserts exit 0 and a sane output shape.
- `src/cli/sim/__test__/assert.test.ts` — same shape for
  assertions; covers a `true` and a `false` case for each.

These tests are the verification surface for plan 01. They go away
or get retired only when plan 02's `setup.simtest.yaml` covers the
same actions end-to-end.

## Open questions resolved

- **How does `cd` change the runner's cwd from a subprocess?** It
  doesn't. `cd`'s subprocess only validates the path. The runner
  (plan 02) reads the simtest step's `cd` input directly and updates
  its own `ctx.cwd`. This keeps the action contract uniform — there
  is no special "side-effecting action" pattern in plan 01.
- **Where do clone directories live?** Under `tmp/sim/clones/<id>/`.
  Cleanup is the runner's responsibility (plan 02); this plan only
  fixes the location.
- **Do assertions get a catalog entry?** Yes, under `asserts:`.
  Output shape is fixed and not declared. This keeps validation in
  one place and makes the parity check uniform.

## Risks and mitigations

- **`git clone` of the local working copy can pick up uncommitted
  state.** `clone_self` clones from the configured origin (not the
  working tree) and checks out the hash returned by
  `get_main_hash`. Document this on the action.
- **Subprocess startup overhead.** Each action invocation is a
  fresh Bun process. For plan 01 there's no runner yet, so this
  doesn't matter. Plan 03 measures and decides whether to act.
- **Protocol drift.** The catalog parity check (every action has a
  file, every file is declared, every input/output validates) is
  the only thing that prevents an action from quietly diverging
  from its declaration. Make it part of the dispatcher's load
  path so every invocation pays the cost.
- **Hand-rolled validation creep.** The validator is a few hundred
  lines covering `string` / `path` / `bool` and the field-level
  cases above. Don't reach for JSON Schema. See
  [`make-it-easy`](../../../principles/make-it-easy.md) — build
  the substrate the suite actually needs.

## Gotchas

- Don't import an action from another action. Actions are leaves;
  composition belongs in the runner.
- Don't read or write files outside the declared input/output JSON
  paths and the cwd-relative effects an action's docstring says it
  has. Hidden side effects break isolation.
- Don't put action I/O JSON anywhere except `tmp/sim/`. The runner
  expects everything ephemeral to live there so cleanup is one
  `rm -r`.
- Don't add a new action without adding its catalog entry and a
  smoke test in the same change. Uncovered actions are dead code.
- Don't extend the action contract with "just one more" implicit
  input (env vars, hidden config files). The JSON file is the
  only input. If you need more, declare it.
- Don't bypass the dispatcher to invoke an action. Every caller —
  human, runner, future tooling — goes through `./cmd sim_action`.

## Out-of-scope reminders

If you're tempted to add to plan 01: a YAML loader, template
substitution, step variables, the simtest runner itself, container
support, parallelism, or watch mode — stop. Plan 02 covers the
runner. Plan 03 matures it. Plan 04 expands the action library.
