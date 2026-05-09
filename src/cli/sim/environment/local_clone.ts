import * as path from "node:path";

import { runCmd } from "@/cli/sim/proc";

export type EnvCtx = { cwd: string };

export async function setup(opts: {
  runDir: string;
  repoRoot: string;
}): Promise<EnvCtx> {
  const cloneDir = path.join(opts.runDir, "clone");

  const originRes = await runCmd(["git", "remote", "get-url", "origin"], {
    cwd: opts.repoRoot,
  });
  if (originRes.exitCode !== 0) {
    throw new Error(
      `git remote get-url origin failed: ${originRes.stderr.trim()}`,
    );
  }
  const origin = originRes.stdout.trim();
  if (!origin) throw new Error("origin URL is empty");

  const cloneRes = await runCmd([
    "git",
    "clone",
    "--depth",
    "1",
    origin,
    cloneDir,
  ]);
  if (cloneRes.exitCode !== 0) {
    throw new Error(`git clone failed: ${cloneRes.stderr.trim()}`);
  }

  const installRes = await runCmd(["bun", "install", "--frozen-lockfile"], {
    cwd: cloneDir,
  });
  if (installRes.exitCode !== 0) {
    throw new Error(
      `bun install --frozen-lockfile failed (${installRes.exitCode}):\nstdout:\n${installRes.stdout}\nstderr:\n${installRes.stderr}`,
    );
  }

  return { cwd: cloneDir };
}
