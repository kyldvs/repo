# Make it easy

Don't build the thing right away. Make it easy to build, then build
it. Investment in the substrate pays back every time you use it.

> "First, solve the problem. Then, write the code." — and before that,
> make the problem easy to solve.

## Why

- The first version of a feature is rarely the last. If the substrate
  is hard, every revision pays the tax again.
- A good substrate turns later features into one-liners. A bad one
  turns each into a project.
- "Just ship it" without easy seams is how repos accrete debt.

## How to apply

- Before implementing, ask: what would make this trivial? Build that
  first.
- Invest in primitives, types, and tooling that the feature will sit
  on. The feature itself should feel small once the substrate is
  right.
- If the second instance of a pattern is painful, stop and improve the
  substrate before adding a third.
- Treat verification harnesses, codegen, and config catalogs as
  substrate — they make the *next* feature cheap.

## Smell tests

- The feature implementation is mostly boilerplate or glue. The
  substrate is missing.
- Adding the next variant requires editing five files in lockstep.
  The shape of the abstraction is wrong.
- "We'll clean this up later." Later rarely comes; build it easy now
  or accept the debt deliberately.

## Counter-balance

- Don't build substrate for hypothetical features. Make it easy for the
  thing you're about to build, not for an imagined fleet of cousins.
- Two instances is a hint; three is a pattern. Don't generalize from
  one.

## Example in this repo

Simtest itself is the substrate: it makes *adding new verification*
cheap, so we can verify aggressively without each verification feeling
expensive. The investment is in the runner and action catalog; each
new simtest is then a short YAML file.
