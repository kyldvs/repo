const VAR_RE = /^\$\{\{\s*steps\.([\w-]+)\s*\}\}$/;

export function substitute(
  value: unknown,
  vars: Record<string, unknown>,
): unknown {
  if (typeof value !== "string") return value;
  const m = value.match(VAR_RE);
  if (!m) return value;
  const name = m[1] as string;
  if (!(name in vars)) {
    throw new Error(`unbound variable: ${name}`);
  }
  return vars[name];
}
