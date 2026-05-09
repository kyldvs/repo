export type EnvCtx = { cwd: string };

export async function setup(opts: {
  runDir: string;
  repoRoot: string;
}): Promise<EnvCtx> {
  void opts.runDir;
  return { cwd: opts.repoRoot };
}
