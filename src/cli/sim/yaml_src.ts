import { type Document, LineCounter, parseDocument } from "yaml";

import { RepoFs } from "@/repo/fs";

export type YamlSrc = {
  path: string;
  doc: Document.Parsed;
  lineCounter: LineCounter;
};

export type YamlPath = (string | number)[];

export function loadYaml(filePath: string): { src: YamlSrc; value: unknown } {
  const raw = RepoFs.readSync(filePath);
  const lineCounter = new LineCounter();
  const doc = parseDocument(raw, { lineCounter });
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    if (first === undefined) {
      throw new Error(`${filePath}: yaml parse error`);
    }
    const offset = first.pos[0];
    const lp = lineCounter.linePos(offset);
    throw new Error(`${filePath}:${lp.line}:${lp.col}: ${first.message}`);
  }
  return { src: { path: filePath, doc, lineCounter }, value: doc.toJS() ?? {} };
}

export function locate(src: YamlSrc, p: YamlPath): string {
  const offset = nodeOffset(src, p);
  if (offset === undefined) return src.path;
  const { line, col } = src.lineCounter.linePos(offset);
  return `${src.path}:${line}:${col}`;
}

function nodeOffset(src: YamlSrc, p: YamlPath): number | undefined {
  for (let i = p.length; i >= 0; i--) {
    const sub = p.slice(0, i);
    const node = src.doc.getIn(sub, true) as
      | { range?: [number, number, number] | null }
      | undefined;
    const offset = node?.range?.[0];
    if (typeof offset === "number") return offset;
  }
  return undefined;
}

export function err(src: YamlSrc, p: YamlPath, message: string): Error {
  return new Error(`${locate(src, p)}: ${message}`);
}
