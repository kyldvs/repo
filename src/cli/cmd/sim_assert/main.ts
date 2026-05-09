import {
  assertFile,
  formatParityDiff,
  loadCatalog,
  parityCheck,
  parityIsClean,
  readInput,
  validateAssertOutput,
  validateInput,
  writeOutput,
} from "@/cli/sim/protocol";
import { RepoFs } from "@/repo/fs";

async function main(): Promise<void> {
  const [name, inputPath, outputPath] = process.argv.slice(2);
  if (!name || !inputPath || !outputPath) {
    process.stderr.write(
      "usage: ./cmd sim_assert <name> <input.json> <output.json>\n",
    );
    process.exit(2);
  }

  const catalog = loadCatalog();
  const diff = parityCheck(catalog);
  if (!parityIsClean(diff)) {
    process.stderr.write(
      `catalog parity check failed:\n${formatParityDiff(diff)}\n`,
    );
    process.exit(1);
  }

  const spec = catalog.asserts[name];
  if (!spec) {
    const available = Object.keys(catalog.asserts).sort();
    process.stderr.write(`no such assertion: ${name}\n`);
    process.stderr.write(
      `available assertions:\n${available.map((n) => `  ${n}`).join("\n")}\n`,
    );
    process.exit(1);
  }

  const file = assertFile(name);
  if (!(await RepoFs.exists(file))) {
    process.stderr.write(
      `no such assertion: ${name} (file missing: ${file})\n`,
    );
    process.exit(1);
  }

  const where = `assert ${name}`;

  const raw = readInput(inputPath);
  const input = validateInput(spec.input, raw, `${where} input`);

  const mod = (await import(file)) as { run?: unknown };
  if (typeof mod.run !== "function") {
    process.stderr.write(`${where}: ${file} does not export run()\n`);
    process.exit(1);
  }

  const output = await (mod.run as (i: unknown) => Promise<unknown>)(input);
  const validated = validateAssertOutput(output, `${where} output`);
  writeOutput(outputPath, validated);
}

main().catch((e) => {
  const err = e as Error;
  process.stderr.write(`${err.message}\n`);
  if (err.stack) {
    const stack = err.stack.split("\n").slice(0, 6).join("\n");
    process.stderr.write(`${stack}\n`);
  }
  process.exit(1);
});
