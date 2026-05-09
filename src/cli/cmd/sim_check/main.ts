import {
  formatParityDiff,
  loadCatalog,
  parityCheck,
  parityIsClean,
} from "@/cli/sim/protocol";

function main(): void {
  const catalog = loadCatalog();
  const diff = parityCheck(catalog);
  if (parityIsClean(diff)) {
    const a = Object.keys(catalog.actions).length;
    const s = Object.keys(catalog.asserts).length;
    process.stdout.write(`catalog ok: ${a} action(s), ${s} assertion(s)\n`);
    return;
  }
  process.stderr.write(
    `catalog parity check failed:\n${formatParityDiff(diff)}\n`,
  );
  process.exit(1);
}

main();
