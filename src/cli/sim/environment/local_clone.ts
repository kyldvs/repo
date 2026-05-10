import * as path from "node:path";

import { cloneFromOrigin } from "@/cli/sim/git";
import { runCmd } from "@/cli/sim/proc";

export type EnvCtx = { cwd: string };

export async function setup(opts: {
  runDir: string;
  repoRoot: string;
}): Promise<EnvCtx> {
  const cloneDir = path.join(opts.runDir, "clone");
  await cloneFromOrigin({ repoRoot: opts.repoRoot, dest: cloneDir });

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
