import * as path from "node:path";

import { dispatch, REPO_ROOT, runIn } from "@/cli/sim/__test__/dispatch";
import { RepoFs } from "@/repo/fs";

import { afterAll, beforeAll, expect, test } from "bun:test";

let scratchDir: string;

beforeAll(async () => {
  await RepoFs.mkdir(path.join(REPO_ROOT, "tmp", "sim"), { recursive: true });
  scratchDir = await RepoFs.mkdtemp(
    path.join(REPO_ROOT, "tmp", "sim", "test-assert-"),
  );
});

afterAll(async () => {
  if (scratchDir) await RepoFs.rm(scratchDir, { recursive: true, force: true });
});

test("dir_exists ok: true for an existing dir", async () => {
  const r = await dispatch(
    "sim_assert",
    "dir_exists",
    { path: "src" },
    scratchDir,
    "dir_exists-true",
  );
  expect(r.exitCode).toBe(0);
  expect(r.output).toEqual({ ok: true });
});

test("dir_exists ok: false for a missing dir", async () => {
  const r = await dispatch(
    "sim_assert",
    "dir_exists",
    { path: "no_such_dir_xyz" },
    scratchDir,
    "dir_exists-false",
  );
  expect(r.exitCode).toBe(0);
  const out = r.output as { ok: boolean; message?: string };
  expect(out.ok).toBe(false);
  expect(typeof out.message).toBe("string");
});

test("is_clean returns true for a clean repo and false for a dirty one", async () => {
  const repo = await RepoFs.mkdtemp(path.join(scratchDir, "is_clean-repo-"));
  const init = await runIn(repo, ["git", "init", "-q"]);
  expect(init.exitCode).toBe(0);
  await runIn(repo, ["git", "config", "user.email", "test@example.com"]);
  await runIn(repo, ["git", "config", "user.name", "Test"]);
  await RepoFs.write(path.join(repo, "f.txt"), "a\n");
  await runIn(repo, ["git", "add", "f.txt"]);
  await runIn(repo, ["git", "commit", "-q", "-m", "init"]);

  const cleanRes = await dispatch(
    "sim_assert",
    "is_clean",
    {},
    scratchDir,
    "is_clean-clean",
    { cwd: repo },
  );
  expect(cleanRes.exitCode).toBe(0);
  expect(cleanRes.output).toEqual({ ok: true });

  await RepoFs.write(path.join(repo, "f.txt"), "b\n");
  const dirtyRes = await dispatch(
    "sim_assert",
    "is_clean",
    {},
    scratchDir,
    "is_clean-dirty",
    { cwd: repo },
  );
  expect(dirtyRes.exitCode).toBe(0);
  const out = dirtyRes.output as { ok: boolean; message?: string };
  expect(out.ok).toBe(false);
  expect(typeof out.message).toBe("string");
});
