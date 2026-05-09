import { runCmd } from "@/cli/sim/proc";

export async function run(): Promise<{ hash: string }> {
  const r = await runCmd(["git", "ls-remote", "origin", "main"]);
  if (r.exitCode !== 0) {
    throw new Error(
      `git ls-remote origin main failed (${r.exitCode}): ${r.stderr.trim()}`,
    );
  }
  const line = r.stdout.split("\n")[0];
  if (!line) throw new Error("git ls-remote returned no output");
  const hash = line.split(/\s+/)[0];
  if (!hash) throw new Error(`could not parse hash from: ${line}`);
  return { hash };
}
