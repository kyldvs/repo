import { runCmd } from "@/cli/sim/proc";

export async function run(): Promise<{ ok: boolean; message?: string }> {
  const r = await runCmd(["git", "status", "--porcelain"]);
  if (r.exitCode !== 0) {
    throw new Error(
      `git status --porcelain failed (${r.exitCode}): ${r.stderr.trim()}`,
    );
  }
  const out = r.stdout.trim();
  if (out === "") return { ok: true };
  return { ok: false, message: out };
}
