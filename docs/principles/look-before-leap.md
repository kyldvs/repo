# Look before you leap

Before planning or building anything, look over the existing
principles and systems. Decide which apply, what's already solved, and
what would be redundant. Plans must list the docs they consulted.

## Why

- Half the work in a healthy repo is already done. Reaching for a
  greenfield solution skips that and ends up with a parallel system.
- A plan that doesn't cite its context is a plan written in a vacuum —
  it will collide with conventions or duplicate machinery.
- Listing relevant docs forces the author (human or AI) to actually
  read them. The act of citing is the act of looking.

## How to apply

- **Before** you outline an approach, scan:
  - `CLAUDE.md` (repo rules)
  - `docs/principles/` (philosophy)
  - `docs/system/` (existing systems)
  - the parts of `src/` your work touches
- Identify which principles constrain the work and which systems can
  be reused or extended instead of rebuilt.
- If something *almost* fits, prefer extending it over starting over.
  See [`compose`](compose.md) and [`make-it-easy`](make-it-easy.md).

## Plan documents

Every plan document must include a section near the top — call it
**Relevant docs**, **Context**, or similar — that lists:

- The principles that constrain the design (with one-line notes on
  *how* each applies).
- The existing systems the plan touches, extends, or coexists with.
- Open questions about scope or precedent that the plan resolves.

Example:

```markdown
## Relevant docs

- [verify](../principles/verify.md) — the harness lands before the
  feature it verifies.
- [declarative](../principles/declarative.md) — pipelines as data,
  not scripts.
- [docs/system/simtest](../system/simtest/) — extend, don't fork.
```

If a section like this is empty, the plan is probably too small to
warrant a doc — or you didn't look.

## Smell tests

- A plan that proposes a new system without citing the existing ones
  it adjoins.
- Two plans solving overlapping problems independently.
- A new abstraction whose first paragraph could be replaced by a link
  to an existing one.

## Pairs with

- [`interface-planning`](interface-planning.md) — once you've looked,
  the next move is to sketch the interface (often by reusing an
  existing one).
