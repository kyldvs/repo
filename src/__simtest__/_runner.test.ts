import * as path from "node:path";

import { test } from "bun:test";

import { discoverSimtests } from "@/cli/sim/discover";
import { formatSimtestError } from "@/cli/sim/error";
import { loadSimtest } from "@/cli/sim/load";
import { runSimtest } from "@/cli/sim/run";
import { matches, parseTagList } from "@/cli/sim/select";

const HERE = import.meta.dir;
const allPaths = await discoverSimtests(HERE);

const filter = {
  include: parseTagList(process.env.SIMTEST_TAG),
  exclude: parseTagList(process.env.SIMTEST_EXCLUDE),
};

for (const p of allPaths) {
  const simtest = loadSimtest(p);
  const rel = path.relative(HERE, p);
  const label = `${simtest.name} (${rel})`;
  if (!matches(simtest.tags, filter)) {
    test.skip(label, () => undefined);
    continue;
  }
  test(
    label,
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
