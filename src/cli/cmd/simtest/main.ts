import * as path from "node:path";

import { discoverSimtests } from "@/cli/sim/discover";
import { formatSimtestError } from "@/cli/sim/error";
import type { Simtest } from "@/cli/sim/load";
import { loadSimtest } from "@/cli/sim/load";
import { repoRoot } from "@/cli/sim/protocol";
import type { RunResult } from "@/cli/sim/run";
import { runLoadedSimtest, runSimtest } from "@/cli/sim/run";
import { matches } from "@/cli/sim/select";

type CliMode = "human" | "json";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub !== "run") {
    process.stderr.write(
      "usage: ./cmd simtest run [--json] [--tag T]... [--exclude T]... [path]\n",
    );
    process.exit(2);
  }

  let mode: CliMode = "human";
  const includeTags: string[] = [];
  const excludeTags: string[] = [];
  const positional: string[] = [];

  const rest = args.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === undefined) break;
    if (a === "--json") {
      mode = "json";
      continue;
    }
    if (a === "--tag" || a === "--exclude") {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("--")) {
        process.stderr.write(`${a}: expected a value\n`);
        process.exit(2);
      }
      if (a === "--tag") includeTags.push(v);
      else excludeTags.push(v);
      i++;
      continue;
    }
    if (a.startsWith("--tag=") || a.startsWith("--exclude=")) {
      const eq = a.indexOf("=");
      const flag = a.slice(0, eq);
      const v = a.slice(eq + 1);
      if (v === "") {
        process.stderr.write(`${flag}: expected a non-empty value\n`);
        process.exit(2);
      }
      if (flag === "--tag") includeTags.push(v);
      else excludeTags.push(v);
      continue;
    }
    if (a.startsWith("--")) {
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
    }
    positional.push(a);
  }

  const target = positional[0];
  const allPaths = target
    ? [path.resolve(target)]
    : await discoverSimtests(path.join(repoRoot(), "src"));

  if (allPaths.length === 0) {
    process.stderr.write("no simtests found under src/\n");
    process.exit(1);
  }

  const filter = { include: includeTags, exclude: excludeTags };
  type Entry = { path: string; simtest?: Simtest };
  const entries: Entry[] = allPaths.map((p) => {
    try {
      return { path: p, simtest: loadSimtest(p) };
    } catch {
      return { path: p };
    }
  });

  let filteredOut = 0;
  const selected: Entry[] = [];
  for (const e of entries) {
    if (e.simtest && !matches(e.simtest.tags, filter)) {
      filteredOut++;
      continue;
    }
    selected.push(e);
  }

  if (selected.length === 0) {
    const filterMsg =
      includeTags.length + excludeTags.length > 0
        ? " (all filtered out by tags)"
        : "";
    process.stderr.write(`no simtests to run${filterMsg}\n`);
    process.exit(1);
  }

  const start = Date.now();
  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (const e of selected) {
    const result = e.simtest
      ? await runLoadedSimtest(e.simtest)
      : await runSimtest(e.path);
    writeResult(result, mode);
    if (result.outcome === "pass") passed++;
    else if (result.outcome === "fail") failed++;
    else errored++;
  }

  const elapsed = Date.now() - start;
  const filteredSuffix =
    filteredOut > 0 ? `, ${filteredOut} filtered` : "";
  const summary = `${passed} passed, ${failed} failed, ${errored} errored${filteredSuffix} in ${elapsed}ms\n`;
  if (mode === "json") {
    process.stderr.write(summary);
  } else {
    process.stdout.write(summary);
  }
  process.exit(failed === 0 && errored === 0 ? 0 : 1);
}

function writeResult(result: RunResult, mode: CliMode): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(toJson(result))}\n`);
    return;
  }
  if (result.outcome === "pass") {
    const tagSuffix = result.tags.length > 0 ? ` [${result.tags.join(",")}]` : "";
    process.stdout.write(
      `PASS ${result.simtest} (${result.durationMs}ms)${tagSuffix}\n`,
    );
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
    outcome: result.outcome,
    environment: result.environment,
    tags: result.tags,
    durationMs: result.durationMs,
    steps: result.steps.map((s) => ({
      index: s.index,
      kind: s.kind,
      name: s.name,
      ok: s.ok,
      durationMs: s.durationMs,
    })),
    ...(result.error ? { error: errorToJson(result.error) } : {}),
  };
}

function errorToJson(err: NonNullable<RunResult["error"]>): unknown {
  const stderr = err.stderr !== undefined ? { stderr: err.stderr } : {};
  if (err.phase === "environment") {
    return {
      phase: err.phase,
      cwd: err.cwd,
      message: err.message,
      ...stderr,
    };
  }
  return {
    phase: err.phase,
    stepIndex: err.stepIndex,
    stepKind: err.stepKind,
    stepName: err.stepName,
    cwd: err.cwd,
    resolvedInputs: err.resolvedInputs,
    message: err.message,
    ...stderr,
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
