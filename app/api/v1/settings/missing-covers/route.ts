import { revalidatePath } from "next/cache";

import { json, readObject, withUser } from "@/lib/api";
import { missingCovers, missingCoversBatch } from "@/lib/books/settings-runs";
import { COVER_CHUNK } from "@/lib/import-limits";

export const dynamic = "force-dynamic";

/** Settings → Find missing covers: the books it would look up, and how many to send at once. */
export const GET = withUser(async (_request, { user }) => json({ items: await missingCovers(user.id), chunk: COVER_CHUNK }));

/**
 * One batch: `{ editionIds }`, at most `chunk`, each looked up in the add
 * order. `outcomes` says what each found (`result`).
 */
export const POST = withUser(async (request, { user }) => {
  const outcomes = await missingCoversBatch(user.id, (await readObject(request)).editionIds);
  if (outcomes.length) revalidatePath("/", "layout");
  return json({ outcomes });
});
