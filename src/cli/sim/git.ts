import { runCmd } from "@/cli/sim/proc";

export async function cloneFromOrigin(opts: {
  repoRoot: string;
  dest: string;
}): Promise<void> {
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
    opts.dest,
  ]);
  if (cloneRes.exitCode !== 0) {
    throw new Error(`git clone failed: ${cloneRes.stderr.trim()}`);
  }
}
