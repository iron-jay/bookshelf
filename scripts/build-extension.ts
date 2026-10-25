/**
 * The Firefox extension (extension/) reads Goodreads pages with the same
 * function as the bookmarklet, so a fix to one is a fix to both. An extension
 * cannot import from the app, so the function is written out to
 * extension/extract.js, which is committed; `--check` (run in the image build)
 * fails when that copy has fallen behind lib/goodreads-bookmarklet.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EXTRACT_SOURCE } from "../lib/goodreads-bookmarklet";

const target = join(__dirname, "..", "extension", "extract.js");
const wanted = `// Written by \`npm run extension:extract\` from lib/goodreads-bookmarklet.ts.
// Edit it there, not here.
${EXTRACT_SOURCE}
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {}
  if (current !== wanted) {
    console.error("extension/extract.js is out of date: run npm run extension:extract and commit it.");
    process.exit(1);
  }
  console.log("extension/extract.js matches the bookmarklet.");
} else {
  writeFileSync(target, wanted);
  console.log(`Wrote ${target}`);
}
