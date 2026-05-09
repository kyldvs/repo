import {
  readdirSync,
  readFileSync,
  renameSync,
  statSync as nodeStatSync,
  writeFileSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat as nodeStat,
  writeFile,
} from "node:fs/promises";

export type Stat = {
  isFile: boolean;
  isDir: boolean;
  size: number;
  mtimeMs: number;
};

export type MkdirOpts = { recursive?: boolean };
export type RmOpts = { recursive?: boolean; force?: boolean };

export type Fs = {
  read(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
  write(path: string, contents: string): Promise<void>;
  mkdir(path: string, opts?: MkdirOpts): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, opts?: RmOpts): Promise<void>;
  stat(path: string): Promise<Stat | null>;
  exists(path: string): Promise<boolean>;

  readSync(path: string): string;
  readDirSync(path: string): string[];
  writeSync(path: string, contents: string): void;
  statSync(path: string): Stat | null;
};

type StatsLike = {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtimeMs: number;
};

function toStat(s: StatsLike): Stat {
  return {
    isFile: s.isFile(),
    isDir: s.isDirectory(),
    size: s.size,
    mtimeMs: s.mtimeMs,
  };
}

function isENOENT(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "ENOENT"
  );
}

export const RepoFs: Fs = {
  async read(path) {
    return readFile(path, "utf8");
  },
  async readDir(path) {
    return readdir(path);
  },
  async write(path, contents) {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, contents);
    await rename(tmp, path);
  },
  async mkdir(path, opts) {
    await mkdir(path, { recursive: opts?.recursive ?? false });
  },
  async mkdtemp(prefix) {
    return mkdtemp(prefix);
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async rm(path, opts) {
    await rm(path, {
      recursive: opts?.recursive ?? false,
      force: opts?.force ?? false,
    });
  },
  async stat(path) {
    try {
      return toStat(await nodeStat(path));
    } catch (e) {
      if (isENOENT(e)) return null;
      throw e;
    }
  },
  async exists(path) {
    return (await RepoFs.stat(path)) !== null;
  },

  readSync(path) {
    return readFileSync(path, "utf8");
  },
  readDirSync(path) {
    return readdirSync(path);
  },
  writeSync(path, contents) {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  },
  statSync(path) {
    try {
      return toStat(nodeStatSync(path));
    } catch (e) {
      if (isENOENT(e)) return null;
      throw e;
    }
  },
};
