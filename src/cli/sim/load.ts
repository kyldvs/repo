import { err, loadYaml, type YamlPath, type YamlSrc } from "@/cli/sim/yaml_src";

export type StepKind = "action" | "assert" | "assert_not";

export type Step = {
  kind: StepKind;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, string>;
};

export type Simtest = {
  path: string;
  src: YamlSrc;
  name: string;
  desc: string;
  steps: Step[];
};

const TOP_KEYS = new Set(["name", "desc", "steps"]);
const STEP_KIND_KEYS = ["action", "assert", "assert_not"] as const;
const STEP_ALL_KEYS = new Set<string>([...STEP_KIND_KEYS, "input", "output"]);

export function loadSimtest(path: string): Simtest {
  const { src, value } = loadYaml(path);
  if (!isObject(value)) {
    throw err(src, [], "top-level must be a map");
  }
  for (const key of Object.keys(value)) {
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
  const stepsRaw = value.steps;
  if (!Array.isArray(stepsRaw)) {
    throw err(src, ["steps"], "steps: expected array");
  }

  const steps: Step[] = [];
  for (const [i, raw] of stepsRaw.entries()) {
    steps.push(parseStep(raw, src, ["steps", i]));
  }

  return { path, src, name, desc, steps };
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
  const output = parseOutput(raw.output, src, [...p, "output"], kind);
  return { kind, name, input, output };
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

function parseOutput(
  raw: unknown,
  src: YamlSrc,
  p: YamlPath,
  kind: StepKind,
): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (kind !== "action") {
    throw err(src, p, "only actions can declare outputs");
  }
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
