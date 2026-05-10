import type { StepKind } from "@/cli/sim/load";

export type Phase = "environment" | "test";

type Common = {
  simtest: string;
  simtestPath: string;
  environment: string;
  cwd: string;
  message: string;
  stderr?: string;
};

export type EnvironmentError = Common & {
  phase: "environment";
};

export type TestError = Common & {
  phase: "test";
  stepIndex: number;
  stepKind: StepKind;
  stepName: string;
  resolvedInputs: Record<string, unknown>;
};

export type SimtestError = EnvironmentError | TestError;

const STDERR_LIMIT = 4 * 1024;

export function truncateStderr(s: string): string {
  if (s.length <= STDERR_LIMIT) return s;
  const head = s.slice(0, STDERR_LIMIT);
  const dropped = s.length - STDERR_LIMIT;
  return `${head}\n…[${dropped} bytes truncated]`;
}

export function formatSimtestError(err: SimtestError): string {
  const lines: string[] = [];
  if (err.phase === "environment") {
    lines.push(`ERROR ${err.simtest} :: environment ${err.environment}`);
  } else {
    lines.push(
      `FAIL ${err.simtest} :: test step #${err.stepIndex} ${err.stepKind} ${err.stepName}`,
    );
  }
  lines.push(`  file:   ${err.simtestPath}`);
  lines.push(`  cwd:    ${err.cwd}`);
  if (err.phase === "test") {
    lines.push(`  inputs: ${formatInputs(err.resolvedInputs)}`);
  }
  if (err.stderr !== undefined && err.stderr.trim() !== "") {
    lines.push("  stderr:");
    for (const l of err.stderr.replace(/\s+$/, "").split("\n")) {
      lines.push(`    ${l}`);
    }
  }
  lines.push(`  cause:  ${err.message}`);
  return lines.join("\n");
}

function formatInputs(inputs: Record<string, unknown>): string {
  if (Object.keys(inputs).length === 0) return "{}";
  return JSON.stringify(inputs);
}
