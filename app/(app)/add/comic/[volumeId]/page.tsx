import { and, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { catalogueWorkHere, comicBook } from "@/lib/books/add-from-catalogue";
import { draftFromCatalogue, seriesNames } from "@/lib/books/draft";
import { today } from "@/lib/books/shelving";
import { comicTitle, comicvineEnabled, getVolume, volumeIssues } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";

import { addComicBook } from "../../actions";
import { AddTabs, ComicVineCredit } from "../../add-tabs";
import { CatalogueAddForm } from "../../catalogue-add-form";
import { ComicIssuesForm } from "./comic-issues-form";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * One Comic Vine volume: pick the issues to shelve — one, or a run read in
 * one go. A graphic novel is a volume of one, so there is nothing to pick.
 */
export const metadata: Metadata = { title: "Add a comic" };

export default async function AddComicVolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ volumeId: string }>;
  searchParams: Promise<{ issue?: string }>;
}) {
  const user = await requireUser();
  const volumeId = Number((await params).volumeId);
  if (!Number.isInteger(volumeId) || volumeId <= 0 || !comicvineEnabled()) notFound();

  const volume = await getVolume(volumeId);
  const issues = volume ? await volumeIssues(volume.id) : [];
  if (!volume || issues.length === 0) {
    return (
      <main className="flex-1 px-4 py-6 sm:px-10">
        <p className="font-narrow">
          Comic Vine did not answer just now, or lists no issues for this.{" "}
          <Link href="/add/comic" className="underline hover:text-ink">
            Back to search
          </Link>
        </p>
      </main>
    );
  }

  const shelved = await db
    .select({ issueId: works.comicvineIssueId, editionId: editions.id })
    .from(works)
    .innerJoin(editions, eq(editions.workId, works.id))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
    .where(inArray(works.comicvineIssueId, issues.map((i) => i.id)));
  const onShelf = new Map(shelved.map((s) => [s.issueId, s.editionId]));
  // One issue to look over before adding: a volume of one, or one chosen
  // from a run's list ("Look over its details first").
  const asked = Number((await searchParams).issue);
  const single = issues.length === 1 ? issues[0] : (issues.find((i) => i.id === asked) ?? null);
  const book = single && !(await catalogueWorkHere({ comicvineIssueId: single.id })) ? await comicBook(single.id, volume) : null;
  const draft = book ? draftFromCatalogue(book) : null;

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-4 font-display text-3xl">Add a comic or graphic novel</h1>
      <AddTabs current="comic" />

      <header className="mb-6">
        <p className="text-lg">
          {volume.name}
          {volume.startYear ? <span className="ml-2 text-ink-dim">{volume.startYear}</span> : null}
        </p>
        <p className="font-narrow text-ink-dim">
          {[volume.publisher, volume.issueCount === 1 ? "1 issue" : `${volume.issueCount} issues`]
            .filter(Boolean)
            .join(" · ")}
          {volume.issueCount > issues.length ? ` · the first ${issues.length} listed` : ""}
        </p>
      </header>

      {single ? (
        <CatalogueAddForm
          action={addComicBook}
          hidden={{ issueId: String(single.id) }}
          withFormat={false}
          defaultFormat="book"
          draft={draft}
          seriesNames={draft ? await seriesNames() : []}
        >
          <div className="flex items-start gap-4">
            <div className="h-36 w-24 shrink-0 bg-panel">
              {single.thumbUrl ? (
                <Image src={single.thumbUrl} alt="" width={96} height={144} className="h-36 w-24 object-cover" unoptimized />
              ) : null}
            </div>
            <p>
              {comicTitle(volume.name, single, volume.issueCount)}
              {single.year ? <span className="ml-2 text-ink-dim">{single.year}</span> : null}
            </p>
          </div>
        </CatalogueAddForm>
      ) : (
        <ComicIssuesForm
          volumeId={volume.id}
          today={today()}
          issues={issues.map((issue) => ({
            id: issue.id,
            label: [issue.issueNumber ? `#${issue.issueNumber}` : "", issue.name ?? ""].filter(Boolean).join(" ") || "Untitled",
            year: issue.year,
            thumbUrl: issue.thumbUrl,
            onShelf: onShelf.has(issue.id),
          }))}
        />
      )}

      {single && issues.length > 1 ? (
        <p className="mt-4 font-narrow">
          <Link href={`/add/comic/${volume.id}`} className="text-ink-dim underline hover:text-ink">
            Back to all its issues
          </Link>
        </p>
      ) : null}
      {single && onShelf.has(single.id) ? (
        <p className="mt-4 font-narrow text-ink-dim">
          Already on your shelf:{" "}
          <Link href={`/edition/${onShelf.get(single.id)}`} className="underline hover:text-ink">
            open it
          </Link>
          .
        </p>
      ) : null}
      <ComicVineCredit />
    </main>
  );
}
