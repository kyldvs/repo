import * as path from "node:path";

import { test } from "bun:test";

import { discoverSimtests } from "@/cli/sim/discover";
import { formatSimtestError } from "@/cli/sim/error";
import { loadSimtest } from "@/cli/sim/load";
import { runSimtest } from "@/cli/sim/run";

const HERE = import.meta.dir;
const META = path.join(HERE, "meta");
const allPaths = await discoverSimtests(HERE);
const paths = allPaths.filter((p) => !p.startsWith(`${META}${path.sep}`));

for (const p of paths) {
  const simtest = loadSimtest(p);
  const rel = path.relative(HERE, p);
  test(
    `${simtest.name} (${rel})`,
    async () => {
      const result = await runSimtest(p);
      if (!result.ok) {
        const reason = result.error
          ? formatSimtestError(result.error)
          : "unknown error";
        throw new Error(reason);
      }
    },
    300_000,
  );
}
