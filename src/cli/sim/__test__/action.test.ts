import * as path from "node:path";

import { dispatch, REPO_ROOT } from "@/cli/sim/__test__/dispatch";
import { RepoFs } from "@/repo/fs";

import { afterAll, beforeAll, expect, test } from "bun:test";

let scratchDir: string;

beforeAll(async () => {
  await RepoFs.mkdir(path.join(REPO_ROOT, "tmp", "sim"), { recursive: true });
  scratchDir = await RepoFs.mkdtemp(
    path.join(REPO_ROOT, "tmp", "sim", "test-action-"),
  );
});

afterAll(async () => {
  if (scratchDir) await RepoFs.rm(scratchDir, { recursive: true, force: true });
});

test("get_main_hash returns a 40-char hex hash", async () => {
  const r = await dispatch(
    "sim_action",
    "get_main_hash",
    {},
    scratchDir,
    "get_main_hash",
  );
  expect(r.exitCode).toBe(0);
  const out = r.output as { hash: string };
  expect(out.hash).toMatch(/^[0-9a-f]{40}$/);
});

test("cd accepts an existing dir, rejects a missing one", async () => {
  const ok = await dispatch(
    "sim_action",
    "cd",
    { path: "src" },
    scratchDir,
    "cd-ok",
  );
  expect(ok.exitCode).toBe(0);
  expect(ok.output).toEqual({});

  const bad = await dispatch(
    "sim_action",
    "cd",
    { path: "no_such_dir_xyz" },
    scratchDir,
    "cd-bad",
  );
  expect(bad.exitCode).not.toBe(0);
});

test("bun_install succeeds in repo root with frozen lockfile", async () => {
  const r = await dispatch(
    "sim_action",
    "bun_install",
    {},
    scratchDir,
    "bun-install",
  );
  expect(r.exitCode).toBe(0);
  expect(r.output).toEqual({});
}, 120_000);
