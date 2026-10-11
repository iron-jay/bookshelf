import { and, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { comicTitle, comicvineEnabled, getVolume, volumeIssues } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";

import { addComicBook } from "../../actions";
import { AddTabs, ComicVineCredit } from "../../add-tabs";
import { CatalogueAddForm } from "../../catalogue-add-form";

export const dynamic = "force-dynamic";

/**
 * One Comic Vine volume: pick the issue to shelve. A graphic novel is a
 * volume of one, so there is nothing to pick.
 */
export default async function AddComicVolumePage({ params }: { params: Promise<{ volumeId: string }> }) {
  const user = await requireUser();
  const volumeId = Number((await params).volumeId);
  if (!Number.isInteger(volumeId) || volumeId <= 0 || !comicvineEnabled()) notFound();

  const volume = await getVolume(volumeId);
  const issues = volume ? await volumeIssues(volume.id) : [];
  if (!volume || issues.length === 0) {
    return (
      <main className="flex-1 p-6">
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
  const single = issues.length === 1 ? issues[0] : null;

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-4 text-xl font-medium">Add a comic or graphic novel</h1>
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

      <CatalogueAddForm
        action={addComicBook}
        hidden={single ? { issueId: String(single.id) } : {}}
        withFormat={false}
        defaultFormat="book"
      >
        {single ? (
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
        ) : (
          <fieldset>
            <legend className="mb-2 font-narrow text-ink-dim">Which one</legend>
            <ul className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
              {issues.map((issue, index) => (
                <li key={issue.id}>
                  <label className="group block cursor-pointer">
                    <input
                      type="radio"
                      name="issueId"
                      value={issue.id}
                      required
                      defaultChecked={index === 0 && !onShelf.has(issue.id)}
                      className="peer sr-only"
                    />
                    <span className="relative block aspect-[2/3] w-full overflow-hidden border-2 border-transparent bg-panel group-hover:border-line peer-checked:border-ink">
                      {issue.thumbUrl ? (
                        <Image src={issue.thumbUrl} alt="" fill sizes="160px" className="object-cover" unoptimized />
                      ) : null}
                    </span>
                    <span className="block truncate font-narrow">
                      {issue.issueNumber ? `#${issue.issueNumber}` : ""}
                      {issue.name ? ` ${issue.name}` : ""}
                    </span>
                    <span className="block truncate font-narrow text-ink-dim">
                      {[issue.year, onShelf.has(issue.id) ? "On your shelf" : null].filter(Boolean).join(" · ") || " "}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </CatalogueAddForm>

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
