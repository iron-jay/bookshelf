import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { refreshEntryPages } from "@/lib/api/refresh";
import { ownEntry } from "@/lib/books/entries";
import { editionDetail } from "@/lib/books/read";
import { removeEdition, removeWork } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** An edition, its work, your entry id when it is on your shelf, and its facts as the page lists them. */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "edition");
  const detail = await editionDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such edition.");
  return json(detail);
});

/**
 * `{ "format": "audiobook" }`: the Book | Audiobook correction, since catalogue
 * data often gets it wrong. Only someone with it on their shelf can say, as on
 * the web. Answers with the edition.
 */
export const PATCH = withUser<{ id: string }>(async (request, { params, user }) => {
  const id = uuidParam((await params).id, "edition");
  const body = await readObject(request);
  if (body.format !== "book" && body.format !== "audiobook") {
    throw new ApiError("invalid", "format is book or audiobook.", { fields: { format: "Must be book or audiobook." } });
  }
  if (!(await ownEntry(user.id, id))) throw new ApiError("forbidden", "Put it on your shelf first.");
  await db.update(editions).set({ format: body.format }).where(eq(editions.id, id));
  refreshEntryPages(id);
  return json(await editionDetail(user.id, id));
});

/**
 * Deletes from an edition, as the web's Delete: the whole book (`scope=work`,
 * the default) or just this edition (`scope=edition`). A book's last edition
 * only goes with the book. Answers `{ deleted: "work" }` or `{ deleted:
 * "edition", workSlug }`.
 */
export const DELETE = withUser<{ id: string }>(async (request, { params }) => {
  const id = uuidParam((await params).id, "edition");
  const [row] = await db
    .select({ workId: works.id, slug: works.slug })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, id));
  if (!row) throw new ApiError("not_found", "No such edition.");

  revalidatePath("/");
  revalidatePath("/off-shelf");
  if (new URL(request.url).searchParams.get("scope") === "edition" && (await removeEdition(id))) {
    revalidatePath(`/work/${row.slug}`);
    return json({ deleted: "edition", workSlug: row.slug });
  }
  await removeWork(row.workId);
  return json({ deleted: "work" });
});
