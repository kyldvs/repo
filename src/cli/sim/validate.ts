import type { Simtest } from "@/cli/sim/load";
import type { Catalog } from "@/cli/sim/protocol";
import { err } from "@/cli/sim/yaml_src";

export function validateSimtest(simtest: Simtest, catalog: Catalog): void {
  const src = simtest.src;
  for (const [i, step] of simtest.steps.entries()) {
    const p = ["steps", i] as (string | number)[];
    const inputSpec =
      step.kind === "action"
        ? catalog.actions[step.name]?.input
        : catalog.asserts[step.name]?.input;
    if (!inputSpec) {
      const kindWord = step.kind === "action" ? "action" : "assertion";
      throw err(
        src,
        [...p, step.kind],
        `unknown ${kindWord} "${step.name}"`,
      );
    }

    for (const k of Object.keys(step.input)) {
      if (!(k in inputSpec)) {
        throw err(
          src,
          [...p, "input", k],
          `input.${k}: not declared on ${step.kind} "${step.name}"`,
        );
      }
    }
    for (const [k, field] of Object.entries(inputSpec)) {
      if (!(k in step.input) && !("default" in field)) {
        throw err(
          src,
          [...p, "input"],
          `input.${k}: missing required field on ${step.kind} "${step.name}"`,
        );
      }
    }

    if (step.kind === "action") {
      const outputSpec = catalog.actions[step.name]?.output ?? {};
      for (const k of Object.keys(step.output)) {
        if (!(k in outputSpec)) {
          throw err(
            src,
            [...p, "output", k],
            `output.${k}: not declared on action "${step.name}"`,
          );
        }
      }
    }
  }
}
