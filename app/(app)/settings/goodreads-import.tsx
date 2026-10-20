"use client";

import type { GoodreadsRow } from "@/lib/import/goodreads";

import { BatchImport } from "./batch-import";
import { importGoodreadsBatch, parseGoodreadsUpload } from "./import-actions";

export function GoodreadsImport() {
  return (
    <BatchImport<GoodreadsRow>
      parse={parseGoodreadsUpload}
      importBatch={importGoodreadsBatch}
      rowTitle={(row) => row.rawTitle}
      accept=".csv,text/csv"
      pickLabel="Choose Goodreads export"
      tooLarge="That file is larger than 20 MB, which no Goodreads export is."
      timing={(count) => {
        const minutes = Math.max(1, Math.round((count * 2) / 60));
        return (
          `Open Library is asked one request a second, so this takes about ${minutes} ` +
          `${minutes === 1 ? "minute" : "minutes"}. Keep this tab open. If it stops — tab closed, ` +
          "server restarted — choose the same file and run it again: books already imported are " +
          "skipped, and nothing on your shelf is overwritten."
        );
      }}
    />
  );
}
