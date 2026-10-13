import { and, eq } from "drizzle-orm";

import { ApiError, json, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { languageName } from "@/lib/languages";
import { coverUrl, getEditions, getWorkSummary, isWorkKey, OpenLibraryError } from "@/lib/openlibrary";

export const dynamic = "force-dynamic";

/**
 * An Open Library work and its editions, to pick one before adding it with
 * POST /entries — what the web's add-a-book page shows. Newest first, at most
 * Open Library's first thousand (`total` says how many there are); `format`
 * is the Book | Audiobook split the phone filters on. Writes nothing.
 */
export const GET = withUser<{ olWorkKey: string }>(async (_request, { params, user }) => {
  const { olWorkKey } = await params;
  if (!isWorkKey(olWorkKey)) throw new ApiError("not_found", "No such work.");

  const [local] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, authors: works.authors, year: works.firstPublishedYear })
    .from(works)
    .where(eq(works.olWorkKey, olWorkKey));

  try {
    const summary = local ? null : await getWorkSummary(olWorkKey);
    if (!local && !summary) throw new ApiError("not_found", "Open Library has no such work.");
    const fetched = await getEditions(olWorkKey);

    const shelved = local
      ? await db
          .select({ id: editions.id, olEditionKey: editions.olEditionKey })
          .from(entries)
          .innerJoin(editions, eq(editions.id, entries.editionId))
          .where(and(eq(entries.userId, user.id), eq(editions.workId, local.id)))
      : [];
    const onShelf = new Map(shelved.flatMap((s) => (s.olEditionKey ? [[s.olEditionKey, s.id] as const] : [])));

    return json({
      olWorkKey,
      // Set when the work is on this server already: its page is /works/{slug}.
      workSlug: local?.slug ?? null,
      title: local?.title ?? summary!.title,
      authors: local?.authors ?? summary!.authors,
      year: local?.year ?? summary!.firstPublishedYear,
      coverUrl: summary?.coverId ? coverUrl(summary.coverId, "M") : null,
      total: fetched?.total ?? 0,
      editions: [...(fetched?.editions ?? [])]
        .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
        .map((e) => ({
          olEditionKey: e.olEditionKey,
          title: e.title,
          format: e.format,
          physicalFormat: e.physicalFormat,
          year: e.year,
          language: languageName(e.language),
          isbn: e.isbn13 ?? e.isbn10,
          pages: e.pages,
          coverUrl: e.coverId ? coverUrl(e.coverId, "M") : null,
          narrators: e.narrators,
          // Your edition's id on this server when it is on your shelf already.
          editionId: onShelf.get(e.olEditionKey) ?? null,
        })),
    });
  } catch (error) {
    if (!(error instanceof OpenLibraryError)) throw error;
    throw error.status === 429
      ? new ApiError("rate_limited", "Open Library is busy; try again in a moment.", { retryAfterSeconds: 30 })
      : new ApiError("upstream", `${error.message}.`);
  }
});
