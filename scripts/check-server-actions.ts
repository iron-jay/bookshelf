/**
 * A `"use server"` file may only export async functions.
 *
 * Exporting anything else from one breaks *every* action on any page that
 * imports it, and neither `next build` nor eslint says a word — the first sign
 * is a 500 from a form that used to work. One exported constant took out the
 * whole settings page this way.
 *
 *     npm run check:actions
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["app", "lib"];
const SKIP = new Set(["node_modules", ".next", ".git"]);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

/** Value exports that are not `export async function` or `export const x = async`. */
function offendingExports(source: string): string[] {
  const problems: string[] = [];

  for (const line of source.split("\n")) {
    const text = line.trim();
    if (!text.startsWith("export")) continue;

    // Types are erased before any of this matters.
    if (/^export\s+(type|interface)\b/.test(text)) continue;
    if (/^export\s+\{\s*type\s/.test(text)) continue;

    if (/^export\s+async\s+function\b/.test(text)) continue;
    if (/^export\s+const\s+\w+\s*[:=][^=]*async\b/.test(text)) continue;

    if (/^export\s+(const|let|var)\b/.test(text)) {
      problems.push(text);
    } else if (/^export\s*\{/.test(text)) {
      problems.push(text);
    } else if (/^export\s+default\b/.test(text) && !/async/.test(text)) {
      problems.push(text);
    } else if (/^export\s+function\b/.test(text)) {
      problems.push(`${text}   (not async)`);
    }
  }

  return problems;
}

async function main(): Promise<number> {
  let checked = 0;
  let bad = 0;

  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      const source = await readFile(file, "utf8");
      if (!/^\s*["']use server["']/.test(source)) continue;

      checked += 1;
      const problems = offendingExports(source);
      if (problems.length === 0) continue;

      bad += 1;
      console.error(`\n${file}`);
      for (const problem of problems) console.error(`  ${problem}`);
    }
  }

  if (bad > 0) {
    console.error(
      `\n${bad} "use server" file${bad === 1 ? " exports" : "s export"} something other than an async function.`,
    );
    console.error("Move it to a plain module both sides can import.\n");
    return 1;
  }

  console.log(`${checked} "use server" files, all exporting only async functions.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
