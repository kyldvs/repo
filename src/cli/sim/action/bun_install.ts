import { runCmd } from "@/cli/sim/proc";

export async function run(input: {
  frozen_lockfile: boolean;
}): Promise<Record<string, never>> {
  const args = ["bun", "install"];
  if (input.frozen_lockfile) args.push("--frozen-lockfile");
  const r = await runCmd(args);
  if (r.exitCode !== 0) {
    throw new Error(
      `bun install failed (${r.exitCode}):\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
  return {};
}
