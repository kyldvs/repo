# Next

Point a clean Claude session at this file to start on the next thing.
Keep this file updated as work lands — when there is no next thing,
say that explicitly. Silence is worse than "no plan queued".

## Right now: implement plan 05 (environments)

Plan: [`docs/system/simtest/plan/05-environments.md`](system/simtest/plan/05-environments.md).
Read it end-to-end before writing any code.

## Read these first, in order

1. `CLAUDE.md` — auto-loaded; principles and house rules.
2. `docs/system/simtest/README.md` — system overview.
3. `docs/system/simtest/plan/05-environments.md` — the plan to
   implement.
4. The earlier plans, for context on what already shipped:
   `01-actions.md` through `04-expand.md`.

## State of the repo today

- Plans 01–04 are shipped. Last three commits:
  - `feat(simtest): plan 02 runner + plan 03 maturation`
  - `feat(simtest): plan 04 docker_run action + container scenario`
  - `docs(simtest): plan 05 environments`
- Schema today: a single top-level `steps:` block per simtest.
  Plan 05 replaces this with `environment: <name>` + `test:` and
  adds top-level `tags:` for selection. There is no
  backwards-compatibility shim — the loader rejects `steps:` from
  day one.
- Environments are catalog-declared (new `environments:` section
  in `.config/sim.yaml`) with implementations under
  `src/cli/sim/environment/<name>.ts`. The parity check in
  `src/cli/sim/protocol.ts` extends to cover them.
- Outcomes are exactly `pass | fail | error`. Missing required
  CLI or environment-setup failure is `error`, never `skip`. The
  runner is loud by default; there is no `--strict` flag. Tags
  are the only way to opt out of running a class of simtest.

## Where to start

Walk plan 05's §"Build order" top to bottom:

1. Catalog: add `environments:` block; extend protocol/parity to
   include it.
2. Implementations under `src/cli/sim/environment/{local,
   local_clone,pod_clone}.ts`. Side effects only under `runDir`.
3. Loader (`src/cli/sim/load.ts`): accept `environment`, `test`,
   `tags`. Reject `steps:` (and `preflight:`, `setup:`,
   `pretest:` to be defensive).
4. Validator (`src/cli/sim/validate.ts`): catalog-check the
   environment name; require `test:` non-empty; tags must be
   strings.
5. Runner (`src/cli/sim/run.ts`): new ERROR path for missing
   `requires:` and for environment setup exceptions
   (`phase: "environment"`). Test phase as today
   (`phase: "test"`). No skip path.
6. Formatter / CLI: add `outcome`, `phase`, `environment`, `tags`
   to human and JSON outputs. Add `--tag` / `--exclude`. Update
   the final summary line to
   `<n> passed, <m> failed, <e> errored[, <f> filtered] in <t>ms`.
7. `src/__simtest__/_runner.test.ts`: read `SIMTEST_TAG` /
   `SIMTEST_EXCLUDE`. Register filtered-out simtests with
   `test.skip` (tag filtering only — never for missing requires).
   Drop the path-based `meta/` filter.
8. Migration — same commit as the loader change so `steps:`
   never half-works:
   - `src/__simtest__/setup.simtest.yaml` →
     `environment: local_clone`, `tags: [host, fast]`, two asserts.
   - `src/__simtest__/setup_container.simtest.yaml` →
     `environment: pod_clone`, `tags: [container, slow]`, two
     asserts.
   - `src/__simtest__/meta/meta_isolation_{a,b}.simtest.yaml` →
     `environment: local`, `tags: [meta, fast]`.
   - Inline YAML fixtures in
     `src/__simtest__/meta/_runner.test.ts` rewrite to the new
     schema.
9. Meta-tests: ERROR from a missing requirement (cause names
   the CLI), ERROR from environment setup failure, FAIL inside
   test phase (`phase: "test"`), and a tag include/exclude
   sanity test.
10. Docs: update `docs/system/simtest/README.md`. The "Step"
    section becomes "Phases / Environments". Add a "Tags and
    selection" section. There is **no** Pre-flight section.

## How to verify

After each meaningful change, run from the repo root:

- `bun run typecheck` — must be clean.
- `bun run lint` — must be clean (the pre-existing biome
  schema-version `info` is OK).
- `bun test` — full suite, including simtests via the
  `_runner.test.ts` harness.
- `./cmd simtest run` — discovery run, all simtests.
- `./cmd simtest run --tag fast --exclude container` — sanity-
  check the new selection mechanism once it's wired.
- `./cmd simtest run --json src/__simtest__/setup.simtest.yaml`
  — confirm the JSON shape includes `outcome`, `environment`,
  `tags`, and (on non-pass) `phase`.

If you can't verify, you don't ship. See
[`docs/principles/verify.md`](principles/verify.md).

## Hold the line on

- No skip outcome under any name. Missing deps are ERROR, loud.
- No `--strict`, `--allow-missing`, or similar opt-in loudness.
  Loudness is the default and only mode.
- No `pretest`/`preflight`/`setup` phase. Two concepts only:
  `environment` and `test`.
- No backwards-compatibility shim for `steps:`. Four simtests is
  not a migration burden; two ways to write a simtest is.
- Tags are pure selection. They do not imply environment
  requirements (and vice versa). `environment: pod_clone` does
  not auto-tag `container`.
- New environments (a fourth, fifth, …) only when there's a real
  consumer. Three ship; more wait for demand.
- Read the plan's §"Explicitly out of scope" and §"Gotchas"
  before adding *anything* not in the build order.

## When this plan is done

1. Update this file. Either point at the next plan or write
   "no plan queued" explicitly.
2. The next candidate plans, in roughly likely order:
   - composition primitives from plan 04 (`include:`, `params`)
     — only when ≥3 simtests share a prefix or a copy-pasted
     value.
   - `--parallel <n>` from plan 04 — only after measurement
     shows serial execution is the bottleneck.
   - in-process action invocation — same gating as parallelism;
     measure first.

If a real demand surfaces something not on the candidate list,
write a new plan first. Don't expand scope in the implementation
commit.
