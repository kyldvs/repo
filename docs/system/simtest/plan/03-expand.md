# Plan 03 — Expansion

Goal: grow the action and assertion library so simtests can describe
more of the repo's verification story, and add the composition
primitives that make large suites maintainable.

Pre-req: plan 02 complete.

This plan is **demand-driven**. Every item below is a candidate, not
a commitment. Do not build any of them speculatively. Each addition
must be justified by a simtest that needs it. If no simtest needs it,
it doesn't ship.

## Candidate actions

Group actions by domain so the registry stays navigable.

### Git

- `git_status` — capture porcelain output as `string`.
- `git_checkout` — input `{ ref: string }`.
- `git_apply_patch` — input `{ patch: path }`.
- `git_diff` — input `{ from: string, to: string }`, output
  `{ diff: string }`.

### Filesystem

- `read_file` — input `{ path: path }`, output `{ content: string }`.
- `write_file` — input `{ path: path, content: string }`.
- `remove` — input `{ path: path, recursive?: bool }`.
- `mkdtemp` — output `{ dir: path }`. Auto-registered for cleanup.

### Bun / build

- `bun_run` — input `{ script: string }`.
- `bun_test` — input `{ filter?: string }`. Captures pass/fail counts
  as outputs.

### Container

Simtest fully owns the repo's verification story, including the
hermetic "fresh clone in a clean container bootstraps cleanly"
scenario that previously lived as a separate repotest. That scenario
is reconstructed as a simtest once container-backed actions exist:

- `podman_run` — input `{ image: string, script: string, mounts?:
  string[] }`, output `{ stdout: string, stderr: string }`.

The replacement simtest composes `clone_self` + `podman_run` to run
`bun install` and downstream checks in `oven/bun:<version>`, asserts
exit zero, and asserts the workspace ends clean. This is a
**promotion criterion** for plan 03: it must land before plan 03 is
considered done, because it restores the coverage repotest used to
provide.

Each action lands with: catalog declaration, implementation, and at
least one simtest that uses it.

## Candidate assertions

- `file_exists` / `file_contains` (substring match).
- `cmd_succeeds` — input `{ cmd: string[] }`.
- `output_equals` — input `{ value: string, expected: string }` for
  validating captured action outputs.
- `output_matches` — input `{ value: string, pattern: string }`.

The bar is the same: an assertion only exists if a simtest needs it.

## Composition primitives

### Includes

```yaml
steps:
  - include: ./common/clone-and-install.simtest.yaml
```

An `include` step inlines another simtest's steps with the current
variable namespace. Cycles are detected and rejected at load time.

This primitive earns its keep when at least three simtests share a
prefix. Don't add it before then.

### Parameters

```yaml
name: "install-with-version"
desc: "..."
params:
  version:
    type: string

steps:
  - action: ...
    input:
      ref: ${{ params.version }}
```

Parameters let the same simtest run with different inputs. The CLI
gains `--param key=value`. Parameters are validated against the
declared schema before execution.

Add this only when there's a concrete simtest that's currently
copy-pasted with one value swapped.

### Tags and selection

- Top-level `tags: [fast, container, integration]`.
- CLI: `./cmd simtest run --tag fast` / `--exclude container`.

Reach for tags only when the suite has grown enough that running all
of it is undesirable. Premature tagging is just clutter.

## Parallelism

If serial execution becomes the bottleneck (measure first — plan 02
records per-step durations), add a `--parallel <n>` flag that runs
distinct simtests concurrently. Within a single simtest, steps stay
sequential; reasoning about ordered effects is the whole point.

Constraints when this lands:

- Each simtest already has an isolated `ctx` (plan 02). No additional
  isolation work should be needed.
- Output is buffered per-simtest and printed atomically on
  completion to keep logs readable.

## Documentation expansion

As actions and assertions accumulate, the README's authoring section
gets terse. Move per-action/per-assertion reference into
`docs/system/simtest/actions.md` and
`docs/system/simtest/asserts.md`, generated (or hand-maintained, if
generation is more code than it saves) from the catalog declarations.

Keep the README focused on *concepts*; push reference material to its
own file when it crosses ~one screenful.

## Anti-goals

- A general workflow language. Simtest is for repo-shaped tests.
  Don't grow conditionals, loops, or expressions unless a real
  scenario forces the issue, and even then prefer adding a focused
  action over adding control flow.
- A plugin/extension API. The action registry is internal; new
  actions are PRs, not packages.
- A web UI, dashboard, history database, or any persistence beyond
  the current run.

## Promotion criteria

Before merging any item from this plan:

1. There exists a simtest that uses the new action/assertion/
   primitive and would not pass without it.
2. The catalog declaration, implementation, and simtest land
   together.
3. The README (or actions/asserts reference) is updated in the same
   change.
4. Plan 02's diagnosability and isolation guarantees still hold.

The repo principle applies harder here than anywhere else: less, but
better. Most of this plan should remain unbuilt until the day a
simtest actually demands it. See
[`make-it-easy`](../../../principles/make-it-easy.md) and
[`verify`](../../../principles/verify.md).
