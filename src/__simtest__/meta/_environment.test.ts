import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, expect, test } from "bun:test";

import { runCmd } from "@/cli/sim/proc";
import { runSimtest } from "@/cli/sim/run";
import { matches, selectByTags } from "@/cli/sim/select";
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

test("tag selection: include filter keeps simtests with any matching tag", () => {
  const items = [
    { path: "a", tags: ["fast", "host"] },
    { path: "b", tags: ["slow", "container"] },
    { path: "c", tags: ["meta", "fast"] },
  ];
  const r = selectByTags(items, { include: ["fast"], exclude: [] });
  expect(r.selected).toEqual(["a", "c"]);
  expect(r.filteredOut).toBe(1);
});

test("tag selection: exclude filter drops simtests with any matching tag", () => {
  const items = [
    { path: "a", tags: ["fast", "host"] },
    { path: "b", tags: ["slow", "container"] },
    { path: "c", tags: ["meta", "fast"] },
  ];
  const r = selectByTags(items, { include: [], exclude: ["container"] });
  expect(r.selected).toEqual(["a", "c"]);
  expect(r.filteredOut).toBe(1);
});

test("tag selection: include then exclude apply together", () => {
  const items = [
    { path: "a", tags: ["fast", "host"] },
    { path: "b", tags: ["fast", "container"] },
    { path: "c", tags: ["slow", "host"] },
  ];
  const r = selectByTags(items, {
    include: ["fast"],
    exclude: ["container"],
  });
  expect(r.selected).toEqual(["a"]);
  expect(r.filteredOut).toBe(2);
});

test("tag selection: empty include and exclude keeps everything", () => {
  expect(matches([], { include: [], exclude: [] })).toBe(true);
  expect(matches(["fast"], { include: [], exclude: [] })).toBe(true);
});
