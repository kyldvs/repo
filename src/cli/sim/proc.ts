export type ProcResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCmd(
  cmd: string[],
  options: { cwd?: string } = {},
): Promise<ProcResult> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}
