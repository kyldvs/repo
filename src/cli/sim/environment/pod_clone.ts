import * as path from "node:path";

import { runCmd } from "@/cli/sim/proc";

export type EnvCtx = { cwd: string };

const BUN_IMAGE = "oven/bun:1.3.12-alpine";

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
