# Gotchas

Every `CLAUDE.md` and similar system doc should carry a **Gotchas**
section. Counter-examples direct AI more reliably than positive rules
alone — they pre-empt the wrong path before it gets walked.

## Why

- Positive rules describe a wide, fuzzy target. Gotchas pin the exact
  edges where the model tends to drift.
- A failure mode named in the doc is one the model can recognize and
  avoid. An unnamed one keeps recurring.
- "Don't do X" with a reason is far cheaper than catching X in review
  ten times.

## What belongs in a gotchas section

- Plausible-but-wrong actions the model would otherwise default to.
- Tools, flags, or commands that look right but aren't allowed here
  (e.g. reaching for `npm`/`node` in a Bun repo).
- Patterns that pass type-check or lint but violate the repo's intent
  (speculative abstractions, just-in-case branches, mock-heavy tests).
- Subtle invariants that are easy to break silently — ordering,
  idempotence, lockfile hygiene.

## Shape of a good gotcha

- Lead with the wrong action, not the right one.
- Give the *why* in one line — the constraint or past failure that
  motivates it.
- Point to the right action when there is one.

```
- Don't run `npm install` — Bun is the package manager. Use `bun install`.
- Don't add a new file when an existing one would do — edit in place.
- Don't write a verification by hand — add a simtest action instead.
```

## What doesn't belong

- Generic advice that applies to any codebase.
- Restatements of positive rules with "don't" prepended.
- Long explanations — if it needs paragraphs, it belongs in a system
  doc, with the gotcha pointing to it.
