import * as path from "node:path";

import { runCmd } from "@/cli/sim/proc";
import { repoRoot } from "@/cli/sim/protocol";
import { RepoFs } from "@/repo/fs";

// Clones from the configured `origin` (not the working tree), so any
// uncommitted state in the local checkout is invisible by design.

export async function run(input: { hash: string }): Promise<{ dir: string }> {
  const clonesRoot = path.join(repoRoot(), "tmp", "sim", "clones");
  await RepoFs.mkdir(clonesRoot, { recursive: true });
  const dir = await RepoFs.mkdtemp(path.join(clonesRoot, "clone-"));

  const originRes = await runCmd(["git", "remote", "get-url", "origin"]);
  if (originRes.exitCode !== 0) {
    throw new Error(
      `git remote get-url origin failed: ${originRes.stderr.trim()}`,
    );
  }
  const origin = originRes.stdout.trim();
  if (!origin) throw new Error("origin URL is empty");

  const cloneRes = await runCmd(["git", "clone", "--depth", "1", origin, dir]);
  if (cloneRes.exitCode !== 0) {
    throw new Error(`git clone failed: ${cloneRes.stderr.trim()}`);
  }

  const checkoutRes = await runCmd(["git", "-C", dir, "checkout", input.hash]);
  if (checkoutRes.exitCode !== 0) {
    throw new Error(
      `git checkout ${input.hash} failed: ${checkoutRes.stderr.trim()}`,
    );
  }

  return { dir };
}
