import * as path from "node:path";

import { RepoFs } from "@/repo/fs";

export async function discoverSimtests(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  await walk(rootDir, result);
  result.sort();
  return result;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await RepoFs.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = await RepoFs.stat(full);
    if (!stat) continue;
    if (stat.isDir) {
      await walk(full, out);
    } else if (stat.isFile && entry.endsWith(".simtest.yaml")) {
      out.push(full);
    }
  }
}
