import * as path from "node:path";

import type { Fs } from "@/repo/fs";
import { RepoFs } from "@/repo/fs";
import { makeStubFs } from "@/repo/fs/__test__/stub";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..");

let scratchDir: string;

beforeAll(async () => {
  await RepoFs.mkdir(path.join(REPO_ROOT, "tmp", "sim"), { recursive: true });
  scratchDir = await RepoFs.mkdtemp(
    path.join(REPO_ROOT, "tmp", "sim", "test-repo-fs-"),
  );
});

afterAll(async () => {
  if (scratchDir) await RepoFs.rm(scratchDir, { recursive: true, force: true });
});

function suite(name: string, makeFs: () => Promise<{ fs: Fs; root: string }>) {
  describe(name, () => {
    test("write then read round-trips", async () => {
      const { fs, root } = await makeFs();
      const p = `${root}/a.txt`;
      await fs.write(p, "hello");
      expect(await fs.read(p)).toBe("hello");
    });

    test("write overwrites existing file", async () => {
      const { fs, root } = await makeFs();
      const p = `${root}/b.txt`;
      await fs.write(p, "one");
      await fs.write(p, "two");
      expect(await fs.read(p)).toBe("two");
    });

    test("stat returns null for missing path; non-null for present", async () => {
      const { fs, root } = await makeFs();
      expect(await fs.stat(`${root}/nope`)).toBeNull();
      const p = `${root}/c.txt`;
      await fs.write(p, "x");
      const s = await fs.stat(p);
      expect(s?.isFile).toBe(true);
      expect(s?.isDir).toBe(false);
    });

    test("exists mirrors stat presence", async () => {
      const { fs, root } = await makeFs();
      expect(await fs.exists(`${root}/nope`)).toBe(false);
      const p = `${root}/d.txt`;
      await fs.write(p, "x");
      expect(await fs.exists(p)).toBe(true);
    });

    test("mkdir recursive creates nested dirs", async () => {
      const { fs, root } = await makeFs();
      const dir = `${root}/nested/a/b`;
      await fs.mkdir(dir, { recursive: true });
      const s = await fs.stat(dir);
      expect(s?.isDir).toBe(true);
    });

    test("readDir returns immediate children", async () => {
      const { fs, root } = await makeFs();
      const dir = `${root}/listdir`;
      await fs.mkdir(dir, { recursive: true });
      await fs.write(`${dir}/x.txt`, "1");
      await fs.write(`${dir}/y.txt`, "2");
      const names = (await fs.readDir(dir)).sort();
      expect(names).toEqual(["x.txt", "y.txt"]);
    });

    test("rename moves a file", async () => {
      const { fs, root } = await makeFs();
      const a = `${root}/from.txt`;
      const b = `${root}/to.txt`;
      await fs.write(a, "v");
      await fs.rename(a, b);
      expect(await fs.exists(a)).toBe(false);
      expect(await fs.read(b)).toBe("v");
    });

    test("rm with recursive+force removes a populated dir", async () => {
      const { fs, root } = await makeFs();
      const dir = `${root}/torm`;
      await fs.mkdir(dir, { recursive: true });
      await fs.write(`${dir}/k.txt`, "v");
      await fs.rm(dir, { recursive: true, force: true });
      expect(await fs.exists(dir)).toBe(false);
    });

    test("sync round-trip matches async", async () => {
      const { fs, root } = await makeFs();
      const p = `${root}/sync.txt`;
      fs.writeSync(p, "sync");
      expect(fs.readSync(p)).toBe("sync");
      expect(fs.statSync(p)?.isFile).toBe(true);
      expect(fs.statSync(`${root}/missing`)).toBeNull();
    });
  });
}

suite("RepoFs (real)", async () => {
  const root = await RepoFs.mkdtemp(`${scratchDir}/case-`);
  return { fs: RepoFs, root };
});

suite("StubFs", async () => {
  const fs = makeStubFs();
  await fs.mkdir("/root", { recursive: true });
  return { fs, root: "/root" };
});

test("Fs type conformance: stub satisfies Fs structurally", () => {
  const fs: Fs = makeStubFs();
  expect(typeof fs.read).toBe("function");
  expect(typeof fs.readSync).toBe("function");
});
