import { statSync } from "node:fs";
import * as path from "node:path";

export async function run(input: {
  path: string;
}): Promise<{ ok: boolean; message?: string }> {
  const resolved = path.resolve(process.cwd(), input.path);
  try {
    if (statSync(resolved).isDirectory()) return { ok: true };
    return {
      ok: false,
      message: `expected dir at ${resolved}; not a directory`,
    };
  } catch {
    return { ok: false, message: `expected dir at ${resolved}; not found` };
  }
}
