import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, expect, test } from "bun:test";

import { runCmd } from "@/cli/sim/proc";
import { runSimtest } from "@/cli/sim/run";
import { matches } from "@/cli/sim/select";
import { RepoFs } from "@/repo/fs";

const HERE = import.meta.dir;
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const META_TMP = path.join(REPO_ROOT, "tmp", "sim", "meta-environment");
let SHADOW_BIN = "";

beforeAll(async () => {
  await RepoFs.mkdir(META_TMP, { recursive: true });
  SHADOW_BIN = await RepoFs.mkdtemp(path.join(os.tmpdir(), "simtest-shadow-"));
});

afterAll(async () => {
  await RepoFs.rm(META_TMP, { recursive: true, force: true });
  if (SHADOW_BIN) {
    await RepoFs.rm(SHADOW_BIN, { recursive: true, force: true });
  }
});

async function writeFixture(name: string, body: string): Promise<string> {
  const p = path.join(META_TMP, `${name}.simtest.yaml`);
  await RepoFs.write(p, body);
  return p;
}

async function withPath<T>(newPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.PATH;
  process.env.PATH = newPath;
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = prev;
    }
  }
}

test("ERROR: missing CLI on PATH names the missing command", async () => {
  const fixture = await writeFixture(
    "meta_requires_missing",
    [
      'name: "meta_requires_missing"',
      'desc: "local_clone with git/bun stripped from PATH"',
      "environment: local_clone",
      "test:",
      "  - assert: dir_exists",
      "    input:",
      "      path: node_modules",
      "",
    ].join("\n"),
  );

  const r = await withPath("/var/empty/simtest-no-such-dir", () =>
    runSimtest(fixture),
  );

  expect(r.outcome).toBe("error");
  expect(r.error?.phase).toBe("environment");
  expect(r.error?.message).toContain("required CLI not on PATH");
  expect(r.error?.message).toContain("git");
  expect(r.error?.message).toContain("local_clone");
});

test("ERROR: environment setup throw is captured with phase environment", async () => {
  const gitScript = path.join(SHADOW_BIN, "git");
  await RepoFs.write(
    gitScript,
    [
      "#!/bin/sh",
      'echo "fake git: induced failure" >&2',
      "exit 1",
      "",
    ].join("\n"),
  );
  const bunScript = path.join(SHADOW_BIN, "bun");
  await RepoFs.write(
    bunScript,
    [
      "#!/bin/sh",
      'echo "fake bun: should not reach this" >&2',
      "exit 1",
      "",
    ].join("\n"),
  );
  const chmod = await runCmd(["chmod", "+x", gitScript, bunScript]);
  expect(chmod.exitCode).toBe(0);

  const fixture = await writeFixture(
    "meta_setup_failure",
    [
      'name: "meta_setup_failure"',
      'desc: "local_clone with a git that always fails"',
      "environment: local_clone",
      "test:",
      "  - assert: dir_exists",
      "    input:",
      "      path: node_modules",
      "",
    ].join("\n"),
  );

  const r = await withPath(SHADOW_BIN, () => runSimtest(fixture));

  expect(r.outcome).toBe("error");
  expect(r.error?.phase).toBe("environment");
  expect(r.error?.message).toContain("local_clone");
  expect(r.error?.message.toLowerCase()).toMatch(/git|setup failed/);
});

test("tag selection: include keeps any matching tag, exclude drops any matching tag", () => {
  const f1 = { include: ["fast"], exclude: [] };
  expect(matches(["fast", "host"], f1)).toBe(true);
  expect(matches(["slow", "container"], f1)).toBe(false);
  expect(matches(["meta", "fast"], f1)).toBe(true);

  const f2 = { include: [], exclude: ["container"] };
  expect(matches(["fast", "host"], f2)).toBe(true);
  expect(matches(["slow", "container"], f2)).toBe(false);

  const f3 = { include: ["fast"], exclude: ["container"] };
  expect(matches(["fast", "host"], f3)).toBe(true);
  expect(matches(["fast", "container"], f3)).toBe(false);
  expect(matches(["slow", "host"], f3)).toBe(false);

  const empty = { include: [], exclude: [] };
  expect(matches([], empty)).toBe(true);
  expect(matches(["fast"], empty)).toBe(true);
});
