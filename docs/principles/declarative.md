# Declarative

Prefer declarative over imperative. Describe *what* the desired state
or pipeline is; let a single executor decide *how*.

## Why

- Declarative artifacts are inspectable, diffable, and reusable. A
  YAML pipeline tells you the whole story at a glance; a shell script
  hides it in control flow.
- One executor, many descriptions: fix a bug once, every caller
  benefits.
- Declarative inputs are easy to validate against a schema before
  anything runs.
- AI and humans both read declarative code more reliably — there's
  less room to misinterpret intent.

## How to apply

- Put the *catalog* of allowed operations in one place with typed
  inputs and outputs. Make it the single source of truth.
- Express scenarios as data that references the catalog. No inline
  shell, no ad-hoc glue.
- Push branching, retries, and state into the executor, not into each
  description.
- When you reach for a loop or conditional in a description, ask
  whether the executor should own that behavior instead.

## Smell tests

- Copy-pasted shell across files — the operation wants to be a named
  primitive.
- A "config" file that's really a script with YAML syntax — operations
  should be pure data, not embedded code.
- Descriptions that have to know about each other to work — orchestration
  has leaked out of the executor.

## Example in this repo

`.config/sim.yaml` declares actions; `*.simtest.yaml` files compose
them. Neither file contains imperative logic — that lives once, in the
runner. See `docs/system/simtest/`.
