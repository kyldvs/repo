import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

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

export type Catalog = {
  actions: Record<string, ActionSpec>;
  asserts: Record<string, AssertSpec>;
};

export type AssertOutput = { ok: boolean; message?: string };

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const CATALOG_PATH = path.join(REPO_ROOT, ".config", "sim.yaml");
const ACTION_DIR = path.join(REPO_ROOT, "src", "cli", "sim", "action");
const ASSERT_DIR = path.join(REPO_ROOT, "src", "cli", "sim", "assert");

export function repoRoot(): string {
  return REPO_ROOT;
}

export function actionFile(name: string): string {
  return path.join(ACTION_DIR, `${name}.ts`);
}

export function assertFile(name: string): string {
  return path.join(ASSERT_DIR, `${name}.ts`);
}

export function loadCatalog(): Catalog {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const parsed = parseYaml(raw) as { actions?: unknown; asserts?: unknown };
  return {
    actions: parseActionMap(parsed.actions ?? {}),
    asserts: parseAssertMap(parsed.asserts ?? {}),
  };
}

function parseActionMap(raw: unknown): Record<string, ActionSpec> {
  if (!isObject(raw)) {
    throw new Error(`${CATALOG_PATH}: actions: expected map`);
  }
  const result: Record<string, ActionSpec> = {};
  for (const [name, body] of Object.entries(raw)) {
    if (!isObject(body)) {
      throw new Error(`${CATALOG_PATH}: actions.${name}: expected map`);
    }
    const desc = body.desc;
    if (typeof desc !== "string") {
      throw new Error(`${CATALOG_PATH}: actions.${name}.desc: expected string`);
    }
    result[name] = {
      desc,
      input: parseIoSpec(body.input, `actions.${name}.input`),
      output: parseIoSpec(body.output, `actions.${name}.output`),
    };
  }
  return result;
}

function parseAssertMap(raw: unknown): Record<string, AssertSpec> {
  if (!isObject(raw)) {
    throw new Error(`${CATALOG_PATH}: asserts: expected map`);
  }
  const result: Record<string, AssertSpec> = {};
  for (const [name, body] of Object.entries(raw)) {
    if (!isObject(body)) {
      throw new Error(`${CATALOG_PATH}: asserts.${name}: expected map`);
    }
    const desc = body.desc;
    if (typeof desc !== "string") {
      throw new Error(`${CATALOG_PATH}: asserts.${name}.desc: expected string`);
    }
    result[name] = {
      desc,
      input: parseIoSpec(body.input, `asserts.${name}.input`),
    };
  }
  return result;
}

function parseIoSpec(raw: unknown, ctx: string): IoSpec {
  if (raw === undefined || raw === null) return {};
  if (!isObject(raw)) {
    throw new Error(`${CATALOG_PATH}: ${ctx}: expected map`);
  }
  const result: IoSpec = {};
  for (const [name, body] of Object.entries(raw)) {
    if (!isObject(body)) {
      throw new Error(`${CATALOG_PATH}: ${ctx}.${name}: expected map`);
    }
    const desc = body.desc;
    const type = body.type;
    if (typeof desc !== "string") {
      throw new Error(`${CATALOG_PATH}: ${ctx}.${name}.desc: expected string`);
    }
    if (type !== "string" && type !== "path" && type !== "bool") {
      throw new Error(
        `${CATALOG_PATH}: ${ctx}.${name}.type: expected one of string|path|bool, got ${String(type)}`,
      );
    }
    const field: FieldSpec = { desc, type };
    if ("default" in body) field.default = body.default;
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
    contents = readFileSync(file, "utf8");
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
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
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

export type ParityDiff = {
  declaredButMissing: { kind: "action" | "assert"; name: string }[];
  fileButUndeclared: { kind: "action" | "assert"; name: string }[];
};

export function parityCheck(catalog: Catalog): ParityDiff {
  const actionFiles = listTsFiles(ACTION_DIR);
  const assertFiles = listTsFiles(ASSERT_DIR);

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

  return diff;
}

function listTsFiles(dir: string): Set<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
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
