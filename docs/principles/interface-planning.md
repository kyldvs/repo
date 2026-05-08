# Interface planning

When planning or building, sketch the interfaces and boundaries
*before* the implementation. Iterate on the interface and how it will
be used until it feels right; only then consider how to build it.

## Why

- The interface is the contract. Get it wrong and every implementation
  detail is in the wrong shape.
- Implementation churn is cheap; interface churn is expensive — every
  caller pays.
- Sketching the call site first surfaces the questions that matter:
  who calls this, with what, expecting what back.
- An ugly call site is the cheapest possible signal that the
  abstraction is wrong. You only get that signal if you write the call
  site first.

## How to apply

- Start with: *what would I want to write at the call site?* Mock it
  in a few lines. Read it back. Does it explain itself?
- Then: *what types/inputs/outputs make that call site possible?* Pin
  the contract before any logic.
- Iterate on the interface in the doc/plan, not in code.
- Walk through 2–3 realistic uses. Edges that don't fit the interface
  are interface bugs, not implementation bugs.
- Only after the interface stabilizes, consider implementation.

## Reuse first

Always check whether an existing interface fits before defining a new
one. See [`look-before-leap`](look-before-leap.md).

- A new function that mirrors an existing one with one parameter
  changed should usually become a parameter on the existing one — or
  prove why it can't.
- A new "registry" or "executor" or "runner" almost always overlaps
  with one already in the repo. Extend it.
- Matching an existing convention (naming, shape, error handling) is
  worth more than a marginally cleaner bespoke design.

## What "sketch the interface" looks like

For a function/module:

```ts
// call site — write this first
const result = runSimtest(simtest, catalog);
if (!result.ok) report(result.error);

// types — derive from the call site
type SimtestResult = { ok: true; steps: StepResult[] }
                   | { ok: false; error: SimtestError; steps: StepResult[] };
```

For a CLI:

```
./cmd simtest run                 # discover all
./cmd simtest run <path>          # run one
./cmd simtest run --tag fast      # filter
```

For a config format: write the YAML you'd want to author, then design
the parser to accept it.

## Smell tests

- The plan jumps straight to data structures or control flow without
  ever showing a call site or example invocation.
- The interface has more parameters than the call site can comfortably
  pass — usually the abstraction is wrong, not the caller.
- Two callers want subtly different shapes from the same function. The
  interface is straddling two responsibilities.
- The implementation is the shortest part of the design and the
  interface is the longest. Good — keep going.

## Pairs with

- [`look-before-leap`](look-before-leap.md) — look for an existing
  interface before designing a new one.
- [`compose`](compose.md) — small, well-shaped interfaces compose;
  fat ones don't.
- [`declarative`](declarative.md) — the cleanest interfaces are often
  data shapes, not function signatures.
