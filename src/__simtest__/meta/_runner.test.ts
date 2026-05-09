import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, expect, test } from "bun:test";

import { runSimtest } from "@/cli/sim/run";
import { RepoFs } from "@/repo/fs";

const HERE = import.meta.dir;
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const META_TMP = path.join(REPO_ROOT, "tmp", "sim", "meta-fixtures");
let NON_GIT_DIR = "";

beforeAll(async () => {
  await RepoFs.mkdir(META_TMP, { recursive: true });
  // Outside the repo so `git status` will not find a parent .git.
  NON_GIT_DIR = await RepoFs.mkdtemp(path.join(os.tmpdir(), "simtest-meta-"));
});

afterAll(async () => {
  await RepoFs.rm(META_TMP, { recursive: true, force: true });
  if (NON_GIT_DIR) {
    await RepoFs.rm(NON_GIT_DIR, { recursive: true, force: true });
  }
});

async function writeFixture(name: string, body: string): Promise<string> {
  const p = path.join(META_TMP, `${name}.simtest.yaml`);
  await RepoFs.write(p, body);
  return p;
}

test("meta_assert_failure: assert: dir_exists on a missing path fails at the expected step", async () => {
  const fixture = await writeFixture(
    "meta_assert_failure",
    [
      'name: "meta_assert_failure"',
      'desc: "intentional false assertion"',
      "steps:",
      "  - assert: dir_exists",
      "    input:",
      "      path: definitely_does_not_exist_xyz",
      "",
    ].join("\n"),
  );

  const r = await runSimtest(fixture);
  expect(r.ok).toBe(false);
  expect(r.error?.stepIndex).toBe(0);
  expect(r.error?.stepKind).toBe("assert");
  expect(r.error?.stepName).toBe("dir_exists");
  expect(r.error?.message).toContain("assertion failed");
});

test("meta_template_missing: unbound steps.X reference produces an error naming the variable", async () => {
  const ref = `$${"{{"} steps.nope }}`;
  const fixture = await writeFixture(
    "meta_template_missing",
    [
      'name: "meta_template_missing"',
      'desc: "references an unbound step variable"',
      "steps:",
      "  - action: clone_self",
      "    input:",
      `      hash: ${ref}`,
      "",
    ].join("\n"),
  );

  const r = await runSimtest(fixture);
  expect(r.ok).toBe(false);
  expect(r.error?.stepIndex).toBe(0);
  expect(r.error?.message).toContain("nope");
});

test("meta_action_missing_input: omitting a required input fails validation with the field name", async () => {
  const fixture = await writeFixture(
    "meta_action_missing_input",
    [
      'name: "meta_action_missing_input"',
      'desc: "clone_self without required hash input"',
      "steps:",
      "  - action: clone_self",
      "",
    ].join("\n"),
  );

  const r = await runSimtest(fixture);
  expect(r.ok).toBe(false);
  expect(r.error?.message).toContain("hash");
});

test("meta_action_unknown: undeclared action fails validation with the action name", async () => {
  const fixture = await writeFixture(
    "meta_action_unknown",
    [
      'name: "meta_action_unknown"',
      'desc: "calls an action that does not exist"',
      "steps:",
      "  - action: definitely_not_an_action",
      "",
    ].join("\n"),
  );

  const r = await runSimtest(fixture);
  expect(r.ok).toBe(false);
  expect(r.error?.message).toContain("definitely_not_an_action");
});

test("meta_subprocess_crash: a non-zero exit propagates with stderr captured", async () => {
  const fixture = await writeFixture(
    "meta_subprocess_crash",
    [
      'name: "meta_subprocess_crash"',
      'desc: "is_clean from a non-git directory crashes the subprocess"',
      "steps:",
      "  - action: cd",
      "    input:",
      `      path: ${NON_GIT_DIR}`,
      "  - assert: is_clean",
      "",
    ].join("\n"),
  );

  const r = await runSimtest(fixture);
  expect(r.ok).toBe(false);
  expect(r.error?.stepIndex).toBe(1);
  expect(r.error?.stepKind).toBe("assert");
  expect(r.error?.stepName).toBe("is_clean");
  expect(r.error?.message).toContain("subprocess exited");
  expect(r.error?.stderr).toBeDefined();
  expect((r.error?.stderr ?? "").length).toBeGreaterThan(0);
});
