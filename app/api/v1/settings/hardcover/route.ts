import { revalidatePath } from "next/cache";

import { json, readObject, withUser } from "@/lib/api";
import { hardcoverBatch, hardcoverCandidates } from "@/lib/books/settings-runs";
import { hardcoverEnabled } from "@/lib/hardcover";
import { COVER_CHUNK } from "@/lib/import-limits";

export const dynamic = "force-dynamic";

/** Settings → Fill in from Hardcover: the local works it would look up (none without a token). */
export const GET = withUser(async (_request, { user }) =>
  json({ enabled: hardcoverEnabled(), items: await hardcoverCandidates(user.id), chunk: COVER_CHUNK }),
);

/** One batch: `{ workIds }`, at most `chunk`. `outcomes` says what each got (`result`). */
export const POST = withUser(async (request, { user }) => {
  const outcomes = await hardcoverBatch(user.id, (await readObject(request)).workIds);
  if (outcomes.length) revalidatePath("/", "layout");
  return json({ outcomes });
});
