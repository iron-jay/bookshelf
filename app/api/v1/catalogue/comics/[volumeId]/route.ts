import { and, eq, inArray } from "drizzle-orm";

import { ApiError, json, withUser } from "@/lib/api";
import { comicTitle, comicvineEnabled, getVolume, volumeIssues } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * One Comic Vine volume and its issues (the first hundred, in number order),
 * to pick one before adding it with POST /entries `{ comicvineIssueId }`.
 * `title` is what the issue will be called on the shelf.
 */
export const GET = withUser<{ volumeId: string }>(async (_request, { params, user }) => {
  if (!comicvineEnabled()) throw new ApiError("upstream", "This server has no Comic Vine key.");
  const volumeId = Number((await params).volumeId);
  if (!Number.isInteger(volumeId) || volumeId <= 0) throw new ApiError("not_found", "No such volume.");

  const volume = await getVolume(volumeId);
  if (!volume) throw new ApiError("upstream", "Comic Vine did not answer, or has no such volume.");
  const issues = await volumeIssues(volume.id);

  const shelved = issues.length
    ? await db
        .select({ issueId: works.comicvineIssueId, editionId: editions.id })
        .from(works)
        .innerJoin(editions, eq(editions.workId, works.id))
        .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
        .where(inArray(works.comicvineIssueId, issues.map((i) => i.id)))
    : [];
  const onShelf = new Map(shelved.map((s) => [s.issueId, s.editionId]));

  return json({
    volumeId: volume.id,
    name: volume.name,
    startYear: volume.startYear,
    publisher: volume.publisher,
    issueCount: volume.issueCount,
    pageUrl: volume.pageUrl,
    issues: issues.map((i) => ({
      comicvineIssueId: i.id,
      issueNumber: i.issueNumber,
      name: i.name,
      title: comicTitle(volume.name, i, volume.issueCount),
      year: i.year,
      coverUrl: i.thumbUrl,
      editionId: onShelf.get(i.id) ?? null,
    })),
  });
});
