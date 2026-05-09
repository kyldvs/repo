# Todo

- Add `src/repo` wrappers for all built-in libraries, starting with `node:fs` (system: [docs/system/repo-wrapper/](system/repo-wrapper/README.md), plan: [01-fs.md](system/repo-wrapper/plan/01-fs.md)). Goal: ban stdlib imports outside `src/repo` (Biome `noRestrictedImports`), enable DI for testing, tighten types, and add guardrails around stdlib usage.
