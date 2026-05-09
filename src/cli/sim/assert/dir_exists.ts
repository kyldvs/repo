import * as path from "node:path";

import { RepoFs } from "@/repo/fs";

export async function run(input: {
  path: string;
}): Promise<{ ok: boolean; message?: string }> {
  const resolved = path.resolve(process.cwd(), input.path);
  const stat = await RepoFs.stat(resolved);
  if (stat === null) {
    return { ok: false, message: `expected dir at ${resolved}; not found` };
  }
  if (!stat.isDir) {
    return {
      ok: false,
      message: `expected dir at ${resolved}; not a directory`,
    };
  }
  return { ok: true };
}
