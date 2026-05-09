import * as path from "node:path";

import { RepoFs } from "@/repo/fs";

export async function run(input: {
  path: string;
}): Promise<Record<string, never>> {
  const resolved = path.resolve(process.cwd(), input.path);
  const stat = await RepoFs.stat(resolved);
  if (!stat?.isDir) {
    throw new Error(`cd: not a directory: ${resolved}`);
  }
  return {};
}
