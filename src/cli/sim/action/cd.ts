import { statSync } from "node:fs";
import * as path from "node:path";

export async function run(input: {
  path: string;
}): Promise<Record<string, never>> {
  const resolved = path.resolve(process.cwd(), input.path);
  let isDir = false;
  try {
    isDir = statSync(resolved).isDirectory();
  } catch {
    throw new Error(`cd: not a directory: ${resolved}`);
  }
  if (!isDir) {
    throw new Error(`cd: not a directory: ${resolved}`);
  }
  return {};
}
