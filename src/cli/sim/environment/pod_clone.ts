import * as path from "node:path";

import { cloneFromOrigin } from "@/cli/sim/git";
import { runCmd } from "@/cli/sim/proc";

export type EnvCtx = { cwd: string };

const BUN_IMAGE = "oven/bun:1.3.12-alpine";

export async function setup(opts: {
  runDir: string;
  repoRoot: string;
}): Promise<EnvCtx> {
  const cloneDir = path.join(opts.runDir, "clone");
  await cloneFromOrigin({ repoRoot: opts.repoRoot, dest: cloneDir });

  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  const dockerRes = await runCmd([
    "docker",
    "run",
    "--rm",
    "--user",
    `${uid}:${gid}`,
    "-v",
    `${cloneDir}:/work`,
    "-w",
    "/work",
    BUN_IMAGE,
    "sh",
    "-c",
    "bun install --frozen-lockfile",
  ]);
  if (dockerRes.exitCode !== 0) {
    throw new Error(
      `bun install in ${BUN_IMAGE} failed (${dockerRes.exitCode}):\nstdout:\n${dockerRes.stdout}\nstderr:\n${dockerRes.stderr}`,
    );
  }

  return { cwd: cloneDir };
}
