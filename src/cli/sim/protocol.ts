import * as path from "node:path";

import { err, loadYaml, type YamlPath, type YamlSrc } from "@/cli/sim/yaml_src";
import { RepoFs } from "@/repo/fs";

export type Type = "string" | "path" | "bool";

export type FieldSpec = {
  desc: string;
  type: Type;
  default?: unknown;
};

export type IoSpec = Record<string, FieldSpec>;

export type ActionSpec = {
  desc: string;
  input: IoSpec;
  output: IoSpec;
};

export type AssertSpec = {
  desc: string;
  input: IoSpec;
};

export type EnvironmentSpec = {
  desc: string;
  requires: string[];
};

export type Catalog = {
  actions: Record<string, ActionSpec>;
  asserts: Record<string, AssertSpec>;
  environments: Record<string, EnvironmentSpec>;
};

export type AssertOutput = { ok: boolean; message?: string };

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const CATALOG_PATH = path.join(REPO_ROOT, ".config", "sim.yaml");
const ACTION_DIR = path.join(REPO_ROOT, "src", "cli", "sim", "action");
const ASSERT_DIR = path.join(REPO_ROOT, "src", "cli", "sim", "assert");
const ENV_DIR = path.join(REPO_ROOT, "src", "cli", "sim", "environment");

export function repoRoot(): string {
  return REPO_ROOT;
}

export function actionFile(name: string): string {
  return path.join(ACTION_DIR, `${name}.ts`);
}

export function assertFile(name: string): string {
  return path.join(ASSERT_DIR, `${name}.ts`);
}

export function environmentFile(name: string): string {
  return path.join(ENV_DIR, `${name}.ts`);
}

const TOP_KEYS = new Set(["actions", "asserts", "environments"]);
const ENV_KEYS = new Set(["desc", "requires"]);
const FIELD_KEYS = new Set(["desc", "type", "default"]);
const ACTION_KEYS = new Set(["desc", "input", "output"]);
const ASSERT_KEYS = new Set(["desc", "input"]);

export function loadCatalog(): Catalog {
  const { src, value } = loadYaml(CATALOG_PATH);
  if (!isObject(value)) {
    throw err(src, [], "top-level must be a map");
  }
  for (const k of Object.keys(value)) {
    if (!TOP_KEYS.has(k)) {
      throw err(src, [k], `unknown top-level key "${k}"`);
    }
  }
  return {
    actions: parseActionMap(value.actions ?? {}, src),
    asserts: parseAssertMap(value.asserts ?? {}, src),
    environments: parseEnvironmentMap(value.environments ?? {}, src),
  };
}

function parseEnvironmentMap(
  raw: unknown,
  src: YamlSrc,
): Record<string, EnvironmentSpec> {
  const root: YamlPath = ["environments"];
  if (!isObject(raw)) {
    throw err(src, root, "environments: expected map");
  }
  const result: Record<string, EnvironmentSpec> = {};
  for (const [name, body] of Object.entries(raw)) {
    const p: YamlPath = [...root, name];
    if (!isObject(body)) {
      throw err(src, p, `environments.${name}: expected map`);
    }
    for (const k of Object.keys(body)) {
      if (!ENV_KEYS.has(k)) {
        throw err(
          src,
          [...p, k],
          `unknown key "${k}" on environment "${name}"`,
        );
      }
    }
    const desc = body.desc;
    if (typeof desc !== "string") {
      throw err(
        src,
        [...p, "desc"],
        `environments.${name}.desc: expected string`,
      );
    }
    const requiresRaw = body.requires ?? [];
    if (!Array.isArray(requiresRaw)) {
      throw err(
        src,
        [...p, "requires"],
        `environments.${name}.requires: expected array`,
      );
    }
    const requires: string[] = [];
    for (const [i, item] of requiresRaw.entries()) {
      if (typeof item !== "string" || item === "") {
        throw err(
          src,
          [...p, "requires", i],
          `environments.${name}.requires[${i}]: expected non-empty string`,
        );
      }
      requires.push(item);
    }
    result[name] = { desc, requires };
  }
  return result;
}

function parseActionMap(
  raw: unknown,
  src: YamlSrc,
): Record<string, ActionSpec> {
  const root: YamlPath = ["actions"];
  if (!isObject(raw)) {
    throw err(src, root, "actions: expected map");
  }
  const result: Record<string, ActionSpec> = {};
  for (const [name, body] of Object.entries(raw)) {
    const p: YamlPath = [...root, name];
    if (!isObject(body)) {
      throw err(src, p, `actions.${name}: expected map`);
    }
    for (const k of Object.keys(body)) {
      if (!ACTION_KEYS.has(k)) {
        throw err(src, [...p, k], `unknown key "${k}" on action "${name}"`);
      }
    }
    const desc = body.desc;
    if (typeof desc !== "string") {
      throw err(src, [...p, "desc"], `actions.${name}.desc: expected string`);
    }
    result[name] = {
      desc,
      input: parseIoSpec(body.input, src, [...p, "input"]),
      output: parseIoSpec(body.output, src, [...p, "output"]),
    };
  }
  return result;
}

function parseAssertMap(
  raw: unknown,
  src: YamlSrc,
): Record<string, AssertSpec> {
  const root: YamlPath = ["asserts"];
  if (!isObject(raw)) {
    throw err(src, root, "asserts: expected map");
  }
  const result: Record<string, AssertSpec> = {};
  for (const [name, body] of Object.entries(raw)) {
    const p: YamlPath = [...root, name];
    if (!isObject(body)) {
      throw err(src, p, `asserts.${name}: expected map`);
    }
    for (const k of Object.keys(body)) {
      if (!ASSERT_KEYS.has(k)) {
        throw err(src, [...p, k], `unknown key "${k}" on assert "${name}"`);
      }
    }
    const desc = body.desc;
    if (typeof desc !== "string") {
      throw err(src, [...p, "desc"], `asserts.${name}.desc: expected string`);
    }
    result[name] = {
      desc,
      input: parseIoSpec(body.input, src, [...p, "input"]),
    };
  }
  return result;
}

function parseIoSpec(raw: unknown, src: YamlSrc, p: YamlPath): IoSpec {
  if (raw === undefined || raw === null) return {};
  if (!isObject(raw)) {
    throw err(src, p, "expected map");
  }
  const result: IoSpec = {};
  for (const [name, body] of Object.entries(raw)) {
    const fp: YamlPath = [...p, name];
    if (!isObject(body)) {
      throw err(src, fp, `${name}: expected map`);
    }
    for (const k of Object.keys(body)) {
      if (!FIELD_KEYS.has(k)) {
        throw err(
          src,
          [...fp, k],
          `unknown key "${k}" on field "${name}" (allowed: desc, type, default)`,
        );
      }
    }
    const desc = body.desc;
    const type = body.type;
    if (typeof desc !== "string") {
      throw err(src, [...fp, "desc"], `${name}.desc: expected string`);
    }
    if (type !== "string" && type !== "path" && type !== "bool") {
      throw err(
        src,
        [...fp, "type"],
        `${name}.type: expected one of string|path|bool, got ${describe(type)}`,
      );
    }
    const field: FieldSpec = { desc, type };
    if ("default" in body) {
      try {
        coerce(body.default, type, `${name}.default`);
      } catch (e) {
        throw err(src, [...fp, "default"], (e as Error).message);
      }
      field.default = body.default;
    }
    result[name] = field;
  }
  return result;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readInput(file: string): unknown {
  let contents: string;
  try {
    contents = RepoFs.readSync(file);
  } catch (e) {
    throw new Error(`reading ${file}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(contents);
  } catch (e) {
    throw new Error(`parsing ${file}: ${(e as Error).message}`);
  }
}

export function writeOutput(file: string, value: unknown): void {
  RepoFs.writeSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function validateInput(
  spec: IoSpec,
  raw: unknown,
  where: string,
): Record<string, unknown> {
  if (!isObject(raw)) {
    throw new Error(`${where}: input must be a JSON object`);
  }
  for (const k of Object.keys(raw)) {
    if (!(k in spec)) {
      throw new Error(`${where}: unknown field "${k}"`);
    }
  }
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec)) {
    let value = raw[name];
    if (value === undefined) {
      if ("default" in field) {
        value = field.default;
      } else {
        throw new Error(`${where}: missing required field "${name}"`);
      }
    }
    result[name] = coerce(value, field.type, `${where}.${name}`);
  }
  return result;
}

export function validateOutput(
  spec: IoSpec,
  raw: unknown,
  where: string,
): Record<string, unknown> {
  if (!isObject(raw)) {
    throw new Error(`${where}: output must be a JSON object`);
  }
  for (const k of Object.keys(raw)) {
    if (!(k in spec)) {
      throw new Error(`${where}: unknown field "${k}"`);
    }
  }
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec)) {
    const value = raw[name];
    if (value === undefined) {
      throw new Error(`${where}: missing required field "${name}"`);
    }
    result[name] = coerce(value, field.type, `${where}.${name}`);
  }
  return result;
}

export function validateAssertOutput(
  raw: unknown,
  where: string,
): AssertOutput {
  if (!isObject(raw)) {
    throw new Error(`${where}: assertion output must be a JSON object`);
  }
  for (const k of Object.keys(raw)) {
    if (k !== "ok" && k !== "message") {
      throw new Error(`${where}: unknown field "${k}"`);
    }
  }
  const ok = raw.ok;
  if (typeof ok !== "boolean") {
    throw new Error(`${where}: ok must be a boolean`);
  }
  const message = raw.message;
  if (message !== undefined && typeof message !== "string") {
    throw new Error(`${where}: message must be a string when present`);
  }
  return message === undefined ? { ok } : { ok, message };
}

function coerce(value: unknown, type: Type, where: string): unknown {
  switch (type) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(`${where}: expected string, got ${describe(value)}`);
      }
      return value;
    case "path":
      if (typeof value !== "string") {
        throw new Error(
          `${where}: expected path string, got ${describe(value)}`,
        );
      }
      return value;
    case "bool":
      if (typeof value !== "boolean") {
        throw new Error(`${where}: expected boolean, got ${describe(value)}`);
      }
      return value;
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export type ParityKind = "action" | "assert" | "environment";

export type ParityDiff = {
  declaredButMissing: { kind: ParityKind; name: string }[];
  fileButUndeclared: { kind: ParityKind; name: string }[];
};

export function parityCheck(catalog: Catalog): ParityDiff {
  const actionFiles = listTsFiles(ACTION_DIR);
  const assertFiles = listTsFiles(ASSERT_DIR);
  const envFiles = listTsFiles(ENV_DIR);

  const diff: ParityDiff = {
    declaredButMissing: [],
    fileButUndeclared: [],
  };

  for (const name of Object.keys(catalog.actions)) {
    if (!actionFiles.has(name)) {
      diff.declaredButMissing.push({ kind: "action", name });
    }
  }
  for (const name of actionFiles) {
    if (!(name in catalog.actions)) {
      diff.fileButUndeclared.push({ kind: "action", name });
    }
  }
  for (const name of Object.keys(catalog.asserts)) {
    if (!assertFiles.has(name)) {
      diff.declaredButMissing.push({ kind: "assert", name });
    }
  }
  for (const name of assertFiles) {
    if (!(name in catalog.asserts)) {
      diff.fileButUndeclared.push({ kind: "assert", name });
    }
  }
  for (const name of Object.keys(catalog.environments)) {
    if (!envFiles.has(name)) {
      diff.declaredButMissing.push({ kind: "environment", name });
    }
  }
  for (const name of envFiles) {
    if (!(name in catalog.environments)) {
      diff.fileButUndeclared.push({ kind: "environment", name });
    }
  }

  return diff;
}

function listTsFiles(dir: string): Set<string> {
  let entries: string[];
  try {
    entries = RepoFs.readDirSync(dir);
  } catch {
    return new Set();
  }
  const result = new Set<string>();
  for (const entry of entries) {
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      result.add(entry.slice(0, -3));
    }
  }
  return result;
}

export function parityIsClean(diff: ParityDiff): boolean {
  return (
    diff.declaredButMissing.length === 0 && diff.fileButUndeclared.length === 0
  );
}

export function formatParityDiff(diff: ParityDiff): string {
  const lines: string[] = [];
  for (const { kind, name } of diff.declaredButMissing) {
    lines.push(`declared ${kind} "${name}" has no implementation file`);
  }
  for (const { kind, name } of diff.fileButUndeclared) {
    lines.push(`${kind} file "${name}.ts" is not declared in the catalog`);
  }
  return lines.join("\n");
}
