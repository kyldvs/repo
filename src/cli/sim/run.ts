import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { type SimtestError, truncateStderr } from "@/cli/sim/error";
import type { Simtest, Step, StepKind } from "@/cli/sim/load";
import { loadSimtest } from "@/cli/sim/load";
import type { Catalog } from "@/cli/sim/protocol";
import { environmentFile, loadCatalog, repoRoot } from "@/cli/sim/protocol";
import { substitute } from "@/cli/sim/template";
import { validateSimtest } from "@/cli/sim/validate";
import { RepoFs } from "@/repo/fs";

export type Outcome = "pass" | "fail" | "error";

export type StepResult = {
  index: number;
  kind: StepKind;
  name: string;
  ok: boolean;
  durationMs: number;
};

export type RunResult = {
  outcome: Outcome;
  ok: boolean;
  simtest: string;
  simtestPath: string;
  environment: string;
  tags: string[];
  durationMs: number;
  steps: StepResult[];
  error?: SimtestError;
};

const CMD = path.join(repoRoot(), "cmd");

type Ctx = { cwd: string; vars: Record<string, unknown> };

type EnvModule = {
  setup: (opts: {
    runDir: string;
    repoRoot: string;
  }) => Promise<{ cwd: string }>;
};

export async function runSimtest(simtestPath: string): Promise<RunResult> {
  const startedAt = Date.now();

  let simtest: Simtest;
  try {
    simtest = loadSimtest(simtestPath);
  } catch (e) {
    return loadOrValidateFailure(simtestPath, simtestPath, "", [], startedAt, e);
  }

  let catalog: Catalog;
  try {
    catalog = loadCatalog();
    validateSimtest(simtest, catalog);
  } catch (e) {
    return loadOrValidateFailure(
      simtest.name,
      simtest.path,
      simtest.environment,
      simtest.tags,
      startedAt,
      e,
    );
  }

  const envSpec = catalog.environments[simtest.environment];
  if (!envSpec) {
    return errorResult(simtest, startedAt, {
      message: `unknown environment "${simtest.environment}"`,
      cwd: process.cwd(),
    });
  }

  const missing = checkRequires(envSpec.requires);
  if (missing.length > 0) {
    return errorResult(simtest, startedAt, {
      message: `required CLI not on PATH: ${missing.join(", ")} (environment ${simtest.environment})`,
      cwd: process.cwd(),
    });
  }

  const runId = makeRunId(simtest.name);
  const runDir = path.join(repoRoot(), "tmp", "sim", runId);
  await RepoFs.mkdir(runDir, { recursive: true });

  const envSnapshot = { ...process.env };

  let envCwd: string;
  try {
    const modUrl = pathToFileURL(environmentFile(simtest.environment)).href;
    const mod = (await import(modUrl)) as EnvModule;
    const ctx = await mod.setup({ runDir, repoRoot: repoRoot() });
    envCwd = ctx.cwd;
  } catch (e) {
    restoreEnv(envSnapshot);
    await RepoFs.rm(runDir, { recursive: true, force: true });
    return errorResult(simtest, startedAt, {
      message: `environment ${simtest.environment} setup failed: ${(e as Error).message}`,
      cwd: process.cwd(),
    });
  }

  const ctx: Ctx = { cwd: envCwd, vars: {} };
  const steps: StepResult[] = [];

  try {
    for (const [i, step] of simtest.steps.entries()) {
      const stepStart = Date.now();
      const r = await runStep(simtest, step, i, ctx, runDir);
      const durationMs = Date.now() - stepStart;
      steps.push({
        index: r.index,
        kind: r.kind,
        name: r.name,
        ok: r.ok,
        durationMs,
      });
      if (!r.ok) {
        return {
          outcome: "fail",
          ok: false,
          simtest: simtest.name,
          simtestPath: simtest.path,
          environment: simtest.environment,
          tags: simtest.tags,
          durationMs: Date.now() - startedAt,
          steps,
          error: r.error,
        };
      }
    }
    return {
      outcome: "pass",
      ok: true,
      simtest: simtest.name,
      simtestPath: simtest.path,
      environment: simtest.environment,
      tags: simtest.tags,
      durationMs: Date.now() - startedAt,
      steps,
    };
  } finally {
    restoreEnv(envSnapshot);
    await RepoFs.rm(runDir, { recursive: true, force: true });
  }
}

type InternalStepResult =
  | { index: number; kind: StepKind; name: string; ok: true }
  | {
      index: number;
      kind: StepKind;
      name: string;
      ok: false;
      error: SimtestError;
    };

async function runStep(
  simtest: Simtest,
  step: Step,
  index: number,
  ctx: Ctx,
  runDir: string,
): Promise<InternalStepResult> {
  const resolvedInput: Record<string, unknown> = {};
  const fail = (message: string, stderr?: string): InternalStepResult => ({
    index,
    kind: step.kind,
    name: step.name,
    ok: false,
    error: {
      simtest: simtest.name,
      simtestPath: simtest.path,
      phase: "test",
      environment: simtest.environment,
      stepIndex: index,
      stepKind: step.kind,
      stepName: step.name,
      cwd: ctx.cwd,
      resolvedInputs: resolvedInput,
      message,
      ...(stderr !== undefined ? { stderr: truncateStderr(stderr) } : {}),
    },
  });

  try {
    for (const [k, v] of Object.entries(step.input)) {
      resolvedInput[k] = substitute(v, ctx.vars);
    }
  } catch (e) {
    return fail((e as Error).message);
  }

  const inPath = path.join(runDir, `step-${index}-input.json`);
  const outPath = path.join(runDir, `step-${index}-output.json`);
  await RepoFs.write(inPath, JSON.stringify(resolvedInput));

  const dispatcher = step.kind === "action" ? "sim_action" : "sim_assert";
  const proc = Bun.spawn([CMD, dispatcher, step.name, inPath, outPath], {
    cwd: ctx.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  void stdout;
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return fail(`subprocess exited ${exitCode}`, stderr);
  }

  let outputRaw: unknown;
  try {
    outputRaw = JSON.parse(await RepoFs.read(outPath));
  } catch (e) {
    return fail(`reading step output: ${(e as Error).message}`);
  }
  if (!isObject(outputRaw)) {
    return fail(`${step.kind} output: expected map`);
  }

  if (step.kind === "action") {
    for (const [outField, varName] of Object.entries(step.output)) {
      ctx.vars[varName] = outputRaw[outField];
    }
    if (step.name === "cd") {
      const p = resolvedInput.path;
      if (typeof p !== "string") {
        return fail("cd: input.path must be a string");
      }
      ctx.cwd = path.resolve(ctx.cwd, p);
    }
  } else {
    const okValue = outputRaw.ok;
    if (typeof okValue !== "boolean") {
      return fail("assert output: ok must be boolean");
    }
    const message =
      typeof outputRaw.message === "string" ? outputRaw.message : undefined;
    const passed = step.kind === "assert" ? okValue : !okValue;
    if (!passed) {
      const reason =
        step.kind === "assert"
          ? `assertion failed${message ? `: ${message}` : ""}`
          : `assert_not failed: assertion held when it should not${message ? ` (${message})` : ""}`;
      return fail(reason);
    }
  }

  return { index, kind: step.kind, name: step.name, ok: true };
}

function checkRequires(requires: string[]): string[] {
  const missing: string[] = [];
  const PATH = process.env.PATH ?? "";
  for (const cmd of requires) {
    if (Bun.which(cmd, { PATH }) === null) {
      missing.push(cmd);
    }
  }
  return missing;
}

function loadOrValidateFailure(
  name: string,
  simtestPath: string,
  environment: string,
  tags: string[],
  startedAt: number,
  e: unknown,
): RunResult {
  const message = (e as Error).message;
  return {
    outcome: "error",
    ok: false,
    simtest: name,
    simtestPath,
    environment,
    tags,
    durationMs: Date.now() - startedAt,
    steps: [],
    error: {
      simtest: name,
      simtestPath,
      phase: "environment",
      environment,
      stepIndex: -1,
      stepKind: "action",
      stepName: "<load>",
      cwd: process.cwd(),
      resolvedInputs: {},
      message,
    },
  };
}

function errorResult(
  simtest: Simtest,
  startedAt: number,
  opts: { message: string; cwd: string },
): RunResult {
  return {
    outcome: "error",
    ok: false,
    simtest: simtest.name,
    simtestPath: simtest.path,
    environment: simtest.environment,
    tags: simtest.tags,
    durationMs: Date.now() - startedAt,
    steps: [],
    error: {
      simtest: simtest.name,
      simtestPath: simtest.path,
      phase: "environment",
      environment: simtest.environment,
      stepIndex: -1,
      stepKind: "action",
      stepName: "<environment>",
      cwd: opts.cwd,
      resolvedInputs: {},
      message: opts.message,
    },
  };
}

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const k of Object.keys(process.env)) {
    if (!(k in snapshot)) {
      delete process.env[k];
    }
  }
  for (const [k, v] of Object.entries(snapshot)) {
    if (process.env[k] !== v) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

function makeRunId(name: string): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${name}-${ts}-${rand}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
