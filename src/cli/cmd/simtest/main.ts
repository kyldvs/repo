import * as path from "node:path";

import { discoverSimtests } from "@/cli/sim/discover";
import { formatSimtestError } from "@/cli/sim/error";
import { repoRoot } from "@/cli/sim/protocol";
import type { RunResult } from "@/cli/sim/run";
import { runSimtest } from "@/cli/sim/run";

type CliMode = "human" | "json";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub !== "run") {
    process.stderr.write("usage: ./cmd simtest run [--json] [path]\n");
    process.exit(2);
  }

  let mode: CliMode = "human";
  const positional: string[] = [];
  for (const a of args.slice(1)) {
    if (a === "--json") {
      mode = "json";
    } else if (a.startsWith("--")) {
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }

  const target = positional[0];
  const paths = target
    ? [path.resolve(target)]
    : await discoverSimtests(path.join(repoRoot(), "src"));

  if (paths.length === 0) {
    process.stderr.write("no simtests found under src/\n");
    process.exit(1);
  }

  const start = Date.now();
  let passed = 0;
  let failed = 0;

  for (const p of paths) {
    const result = await runSimtest(p);
    writeResult(result, mode);
    if (result.ok) passed++;
    else failed++;
  }

  const elapsed = Date.now() - start;
  const summary = `${passed} passed, ${failed} failed in ${elapsed}ms\n`;
  if (mode === "json") {
    process.stderr.write(summary);
  } else {
    process.stdout.write(summary);
  }
  process.exit(failed === 0 ? 0 : 1);
}

function writeResult(result: RunResult, mode: CliMode): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(toJson(result))}\n`);
    return;
  }
  if (result.ok) {
    process.stdout.write(`PASS ${result.simtest} (${result.durationMs}ms)\n`);
    return;
  }
  if (result.error) {
    process.stdout.write(`${formatSimtestError(result.error)}\n`);
  } else {
    process.stdout.write(`FAIL ${result.simtest} :: unknown error\n`);
  }
}

function toJson(result: RunResult): unknown {
  return {
    name: result.simtest,
    path: result.simtestPath,
    ok: result.ok,
    durationMs: result.durationMs,
    steps: result.steps.map((s) => ({
      index: s.index,
      kind: s.kind,
      name: s.name,
      ok: s.ok,
      durationMs: s.durationMs,
    })),
    ...(result.error
      ? {
          error: {
            stepIndex: result.error.stepIndex,
            stepKind: result.error.stepKind,
            stepName: result.error.stepName,
            cwd: result.error.cwd,
            resolvedInputs: result.error.resolvedInputs,
            message: result.error.message,
            ...(result.error.stderr !== undefined
              ? { stderr: result.error.stderr }
              : {}),
          },
        }
      : {}),
  };
}

main().catch((e) => {
  const err = e as Error;
  process.stderr.write(`${err.message}\n`);
  if (err.stack) {
    const stack = err.stack.split("\n").slice(0, 6).join("\n");
    process.stderr.write(`${stack}\n`);
  }
  process.exit(1);
});
