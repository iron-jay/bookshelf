"use client";

import type { RestoreRow } from "@/lib/import/restore";

import { BatchImport } from "./batch-import";
import { parseRestoreUpload, restoreBatch } from "./import-actions";

export function RestoreImport() {
  return (
    <BatchImport<RestoreRow>
      parse={parseRestoreUpload}
      importBatch={restoreBatch}
      rowTitle={(row) => row.work.title}
      accept=".json,application/json"
      pickLabel="Choose bookshelf export"
      tooLarge="That file is larger than 20 MB."
      timing={(count) => {
        const minutes = Math.max(1, Math.round((count * 2) / 60));
        return (
          `Books not here yet are looked up on Open Library for their covers, one request a ` +
          `second, so this takes up to ${minutes} ${minutes === 1 ? "minute" : "minutes"}. Keep this ` +
          "tab open. If it stops, choose the same file and run it again: what is already here is " +
          "skipped, and nothing on your shelf is overwritten."
        );
      }}
    />
  );
}
