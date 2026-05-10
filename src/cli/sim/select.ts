export type TagFilter = { include: string[]; exclude: string[] };

export function matches(tags: string[], filter: TagFilter): boolean {
  if (filter.include.length > 0) {
    if (!filter.include.some((t) => tags.includes(t))) return false;
  }
  for (const t of filter.exclude) {
    if (tags.includes(t)) return false;
  }
  return true;
}

export function parseTagList(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
