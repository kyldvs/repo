# Next

Point a clean Claude session at this file to start on the next thing.
Keep this file updated as work lands — when there is no next thing,
say that explicitly. Silence is worse than "no plan queued".

## Right now: no plan queued

Plans 01–05 are shipped. Nothing is queued at the moment. New work
needs a written plan first; do not expand scope in an implementation
commit.

## State of the repo today

- Plan 05 (environments) is in. Schema is `name` + `desc` +
  `environment` + `tags` + `test:`. The legacy `steps:` key fails to
  load. Outcomes are exactly `pass | fail | error`; both `fail` and
  `error` exit non-zero. There is no skip outcome.
- Three environments ship: `local`, `local_clone`, `pod_clone`.
  `setup.simtest.yaml` and `setup_container.simtest.yaml` are now
  two-assert contract checks against the corresponding environment.
- CLI flags `--tag` and `--exclude` filter at discovery time. The
  bun-test harness reads `SIMTEST_TAG` / `SIMTEST_EXCLUDE` and
  registers filtered-out simtests with `test.skip`.
- Reporter / JSON output carry `outcome`, `environment`, `tags`, and
  (on non-pass) `phase` (`"test" | "environment"`). Final summary is
  `<n> passed, <m> failed, <e> errored[, <f> filtered] in <t>ms`.

## Candidate plans, in roughly likely order

- composition primitives from plan 04 (`include:`, `params`) — only
  when ≥3 simtests share a prefix or a copy-pasted value.
- `--parallel <n>` from plan 04 — only after measurement shows serial
  execution is the bottleneck.
- in-process action invocation — same gating as parallelism; measure
  first.

If a real demand surfaces something not on the candidate list, write
a new plan first. Don't expand scope in the implementation commit.
