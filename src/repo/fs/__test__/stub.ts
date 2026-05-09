import type { Fs, Stat } from "@/repo/fs";

type Entry = { kind: "file"; contents: string } | { kind: "dir" };

export type StubFsState = {
  entries: Map<string, Entry>;
  tmpCounter: number;
};

function ensureParentDirs(state: StubFsState, path: string): void {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  const isAbs = path.startsWith("/");
  let cur = isAbs ? "" : ".";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = `${cur}/${parts[i]}`;
    if (!state.entries.has(cur)) state.entries.set(cur, { kind: "dir" });
  }
}

function enoent(path: string): Error {
  const e = new Error(`ENOENT: no such file or directory, '${path}'`) as Error & {
    code: string;
  };
  e.code = "ENOENT";
  return e;
}

function eisdir(path: string): Error {
  const e = new Error(`EISDIR: illegal operation on a directory, '${path}'`) as Error & {
    code: string;
  };
  e.code = "EISDIR";
  return e;
}

function notDir(path: string): Error {
  const e = new Error(`ENOTDIR: not a directory, '${path}'`) as Error & {
    code: string;
  };
  e.code = "ENOTDIR";
  return e;
}

function statOf(entry: Entry): Stat {
  if (entry.kind === "dir") {
    return { isFile: false, isDir: true, size: 0, mtimeMs: 0 };
  }
  return {
    isFile: true,
    isDir: false,
    size: entry.contents.length,
    mtimeMs: 0,
  };
}

export type StubFs = Fs & { state: StubFsState };

export function makeStubFs(initial: Record<string, string> = {}): StubFs {
  const state: StubFsState = { entries: new Map(), tmpCounter: 0 };
  for (const [path, contents] of Object.entries(initial)) {
    ensureParentDirs(state, path);
    state.entries.set(path, { kind: "file", contents });
  }

  const stub: StubFs = {
    state,

    async read(path) {
      return stub.readSync(path);
    },
    async readDir(path) {
      return stub.readDirSync(path);
    },
    async write(path, contents) {
      stub.writeSync(path, contents);
    },
    async mkdir(path, opts) {
      const recursive = opts?.recursive ?? false;
      if (recursive) {
        ensureParentDirs(state, `${path}/x`);
        if (!state.entries.has(path)) state.entries.set(path, { kind: "dir" });
        return;
      }
      const existing = state.entries.get(path);
      if (existing) return;
      state.entries.set(path, { kind: "dir" });
    },
    async mkdtemp(prefix) {
      const id = ++state.tmpCounter;
      const path = `${prefix}stub${id}`;
      ensureParentDirs(state, `${path}/x`);
      state.entries.set(path, { kind: "dir" });
      return path;
    },
    async rename(from, to) {
      const entry = state.entries.get(from);
      if (!entry) throw enoent(from);
      ensureParentDirs(state, to);
      state.entries.delete(from);
      state.entries.set(to, entry);
      if (entry.kind === "dir") {
        const prefix = `${from}/`;
        for (const [k, v] of [...state.entries.entries()]) {
          if (k.startsWith(prefix)) {
            state.entries.delete(k);
            state.entries.set(`${to}/${k.slice(prefix.length)}`, v);
          }
        }
      }
    },
    async rm(path, opts) {
      const force = opts?.force ?? false;
      const recursive = opts?.recursive ?? false;
      const entry = state.entries.get(path);
      if (!entry) {
        if (force) return;
        throw enoent(path);
      }
      state.entries.delete(path);
      if (entry.kind === "dir" && recursive) {
        const prefix = `${path}/`;
        for (const k of [...state.entries.keys()]) {
          if (k.startsWith(prefix)) state.entries.delete(k);
        }
      }
    },
    async stat(path) {
      return stub.statSync(path);
    },
    async exists(path) {
      return state.entries.has(path);
    },

    readSync(path) {
      const entry = state.entries.get(path);
      if (!entry) throw enoent(path);
      if (entry.kind === "dir") throw eisdir(path);
      return entry.contents;
    },
    readDirSync(path) {
      const entry = state.entries.get(path);
      if (!entry) throw enoent(path);
      if (entry.kind !== "dir") throw notDir(path);
      const prefix = `${path}/`;
      const names: string[] = [];
      for (const k of state.entries.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (rest.includes("/")) continue;
        names.push(rest);
      }
      return names.sort();
    },
    writeSync(path, contents) {
      ensureParentDirs(state, path);
      const existing = state.entries.get(path);
      if (existing?.kind === "dir") throw eisdir(path);
      state.entries.set(path, { kind: "file", contents });
    },
    statSync(path) {
      const entry = state.entries.get(path);
      return entry ? statOf(entry) : null;
    },
  };

  return stub;
}
