import * as path from "node:path";

import { expect, test } from "bun:test";

import { runSimtest } from "@/cli/sim/run";
import { RepoFs } from "@/repo/fs";

const HERE = import.meta.dir;
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SIM_TMP = path.join(REPO_ROOT, "tmp", "sim");
const A = path.join(HERE, "meta_isolation_a.simtest.yaml");
const B = path.join(HERE, "meta_isolation_b.simtest.yaml");

test("isolation pair: cwd reset, env restored, run dirs cleaned", async () => {
  const cwdBefore = process.cwd();
  const envBefore = JSON.stringify(process.env);
  const runDirsBefore = await listRunDirs();

  const a = await runSimtest(A);
  expect(a.ok).toBe(true);

  const b = await runSimtest(B);
  expect(b.ok).toBe(true);

  expect(process.cwd()).toBe(cwdBefore);
  expect(JSON.stringify(process.env)).toBe(envBefore);

  const runDirsAfter = await listRunDirs();
  expect(runDirsAfter).toEqual(runDirsBefore);
}, 60_000);

async function listRunDirs(): Promise<string[]> {
  const stat = await RepoFs.stat(SIM_TMP);
  if (stat === null) return [];
  const entries = await RepoFs.readDir(SIM_TMP);
  return entries.filter((e) => e !== "clones").sort();
}
