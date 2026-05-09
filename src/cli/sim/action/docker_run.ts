import { runCmd } from "@/cli/sim/proc";

export async function run(input: {
  image: string;
  script: string;
  mount_src: string;
  mount_dst: string;
}): Promise<{ stdout: string; stderr: string }> {
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  const cmd = [
    "docker",
    "run",
    "--rm",
    "--user",
    `${uid}:${gid}`,
    "-v",
    `${input.mount_src}:${input.mount_dst}`,
    "-w",
    input.mount_dst,
    input.image,
    "sh",
    "-c",
    input.script,
  ];
  const r = await runCmd(cmd);
  if (r.exitCode !== 0) {
    throw new Error(
      `docker_run failed (${r.exitCode}) image=${input.image}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
  return { stdout: r.stdout, stderr: r.stderr };
}
