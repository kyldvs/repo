import { err, loadYaml, type YamlPath, type YamlSrc } from "@/cli/sim/yaml_src";

export type StepKind = "action" | "assert" | "assert_not";

export type ActionStep = {
  kind: "action";
  name: string;
  input: Record<string, unknown>;
  output: Record<string, string>;
};

export type AssertionStep = {
  kind: "assert" | "assert_not";
  name: string;
  input: Record<string, unknown>;
};

export type Step = ActionStep | AssertionStep;

export type Simtest = {
  path: string;
  src: YamlSrc;
  name: string;
  desc: string;
  environment: string;
  tags: string[];
  steps: Step[];
};

const TOP_KEYS = new Set(["name", "desc", "environment", "tags", "test"]);
const REJECTED_TOP_KEYS = new Set(["steps", "preflight", "setup", "pretest"]);
const STEP_KIND_KEYS = ["action", "assert", "assert_not"] as const;
const STEP_ALL_KEYS = new Set<string>([...STEP_KIND_KEYS, "input", "output"]);
const DEFAULT_ENVIRONMENT = "local";

export function loadSimtest(path: string): Simtest {
  const { src, value } = loadYaml(path);
  if (!isObject(value)) {
    throw err(src, [], "top-level must be a map");
  }
  for (const key of Object.keys(value)) {
    if (REJECTED_TOP_KEYS.has(key)) {
      throw err(
        src,
        [key],
        `"${key}" is no longer supported; use "environment" + "test" (see docs/system/simtest/README.md)`,
      );
    }
    if (!TOP_KEYS.has(key)) {
      throw err(src, [key], `unknown top-level key "${key}"`);
    }
  }

  const name = value.name;
  if (typeof name !== "string" || name === "") {
    throw err(src, ["name"], "name: expected non-empty string");
  }
  const desc = value.desc;
  if (typeof desc !== "string") {
    throw err(src, ["desc"], "desc: expected string");
  }

  let environment = DEFAULT_ENVIRONMENT;
  if ("environment" in value) {
    const e = value.environment;
    if (typeof e !== "string" || e === "") {
      throw err(src, ["environment"], "environment: expected non-empty string");
    }
    environment = e;
  }

  const tags: string[] = [];
  if ("tags" in value) {
    const raw = value.tags;
    if (!Array.isArray(raw)) {
      throw err(src, ["tags"], "tags: expected array");
    }
    for (const [i, item] of raw.entries()) {
      if (typeof item !== "string" || item === "") {
        throw err(src, ["tags", i], `tags[${i}]: expected non-empty string`);
      }
      tags.push(item);
    }
  }

  const stepsRaw = value.test;
  if (!Array.isArray(stepsRaw)) {
    throw err(src, ["test"], "test: expected array");
  }
  if (stepsRaw.length === 0) {
    throw err(src, ["test"], "test: must have at least one step");
  }

  const steps: Step[] = [];
  for (const [i, raw] of stepsRaw.entries()) {
    steps.push(parseStep(raw, src, ["test", i]));
  }

  return { path, src, name, desc, environment, tags, steps };
}

function parseStep(raw: unknown, src: YamlSrc, p: YamlPath): Step {
  if (!isObject(raw)) {
    throw err(src, p, "step: expected map");
  }
  for (const k of Object.keys(raw)) {
    if (!STEP_ALL_KEYS.has(k)) {
      throw err(src, [...p, k], `unknown step key "${k}"`);
    }
  }

  let kind: StepKind | undefined;
  let name: string | undefined;
  for (const k of STEP_KIND_KEYS) {
    if (!(k in raw)) continue;
    if (kind !== undefined) {
      throw err(src, [...p, k], `cannot have both "${kind}" and "${k}"`);
    }
    const v = raw[k];
    if (typeof v !== "string" || v === "") {
      throw err(src, [...p, k], `${k}: expected non-empty string`);
    }
    kind = k;
    name = v;
  }
  if (kind === undefined || name === undefined) {
    throw err(src, p, "missing one of action/assert/assert_not");
  }

  const input = parseInput(raw.input, src, [...p, "input"]);
  if (kind === "action") {
    const output = parseActionOutput(raw.output, src, [...p, "output"]);
    return { kind, name, input, output };
  }
  if (raw.output !== undefined && raw.output !== null) {
    throw err(src, [...p, "output"], "only actions can declare outputs");
  }
  return { kind, name, input };
}

function parseInput(
  raw: unknown,
  src: YamlSrc,
  p: YamlPath,
): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isObject(raw)) {
    throw err(src, p, "input: expected map");
  }
  return { ...raw };
}

function parseActionOutput(
  raw: unknown,
  src: YamlSrc,
  p: YamlPath,
): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (!isObject(raw)) {
    throw err(src, p, "output: expected map");
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string" || v === "") {
      throw err(
        src,
        [...p, k],
        `${k}: expected non-empty string (variable name)`,
      );
    }
    result[k] = v;
  }
  return result;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
