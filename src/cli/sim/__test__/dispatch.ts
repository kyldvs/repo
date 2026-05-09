import * as path from "node:path";

import { RepoFs } from "@/repo/fs";

export const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..");
export const CMD = path.join(REPO_ROOT, "cmd");

export type DispatchResult = {
  exitCode: number;
  output: unknown;
  stdout: string;
  stderr: string;
};

export async function dispatch(
  cmd: "sim_action" | "sim_assert",
  name: string,
  input: unknown,
  scratchDir: string,
  tag: string,
  options: { cwd?: string } = {},
): Promise<DispatchResult> {
  const inPath = path.join(scratchDir, `${tag}.in.json`);
  const outPath = path.join(scratchDir, `${tag}.out.json`);
  await RepoFs.write(inPath, JSON.stringify(input));
  const proc = Bun.spawn([CMD, cmd, name, inPath, outPath], {
    cwd: options.cwd ?? REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const output = (await RepoFs.exists(outPath))
    ? JSON.parse(await RepoFs.read(outPath))
    : undefined;
  return { exitCode, output, stdout, stderr };
}

export async function runIn(
  cwd: string,
  cmd: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}
