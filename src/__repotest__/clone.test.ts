import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

const pkg = (await Bun.file(join(REPO_ROOT, "package.json")).json()) as {
  packageManager?: string;
};
const bunVersion = (pkg.packageManager ?? "bun@1").split("@")[1];
const image = `oven/bun:${bunVersion}`;

const uid = process.getuid?.() ?? 0;
const gid = process.getgid?.() ?? 0;

describe("repotest:clone", () => {
  test("podman is installed", () => {
    const res = Bun.spawnSync(["podman", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(res.success).toBe(true);
  });

  test(
    "fresh clone installs and verifies in an isolated podman container",
    async () => {
      const work = mkdtempSync(join(tmpdir(), "repotest-clone-"));
      const cloned = join(work, "repo");
      try {
        const clone = Bun.spawnSync(
          ["git", "clone", "--depth", "1", REPO_ROOT, cloned],
          { stdout: "inherit", stderr: "inherit" },
        );
        expect(clone.exitCode).toBe(0);

        // Setup steps only — we deliberately do not run `bun run test`
        // inside the container, since that would re-enter this file and
        // attempt to start a nested container.
        const script = [
          "set -eu",
          "cd /work",
          "bun install --frozen-lockfile",
          "bun run typecheck",
          "bun run lint",
          "bun run build",
        ].join(" && ");

        const proc = Bun.spawn(
          [
            "podman",
            "run",
            "--rm",
            "--user",
            `${uid}:${gid}`,
            "-e",
            "HOME=/tmp",
            "-v",
            `${cloned}:/work`,
            "-w",
            "/work",
            image,
            "sh",
            "-c",
            script,
          ],
          { stdout: "inherit", stderr: "inherit" },
        );
        expect(await proc.exited).toBe(0);
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000,
  );
});
