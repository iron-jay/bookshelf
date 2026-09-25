import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { parseIsbn } from "@/lib/isbn";
import {
  coverUrl,
  EDITIONS_PAGE,
  getEdition,
  getEditions,
  getWorkSummary,
  isEditionKey,
  isWorkKey,
  OpenLibraryError,
  type OlEditionSummary,
} from "@/lib/openlibrary";

import { AddForm } from "../../add-form";
import type { PickerEdition } from "../../edition-picker";
import { FORMAT_COOKIE, isFormat, type Format } from "../../format";

export const dynamic = "force-dynamic";

function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames("en", { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Newest first, undated last: the edition someone is holding is usually recent. */
function byYear(a: OlEditionSummary, b: OlEditionSummary): number {
  return (b.year ?? -Infinity) - (a.year ?? -Infinity);
}

export default async function AddBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ olWorkKey: string }>;
  searchParams: Promise<{ edition?: string; isbn?: string }>;
}) {
  const user = await requireUser();
  const { olWorkKey } = await params;
  const query = await searchParams;
  if (!isWorkKey(olWorkKey)) notFound();

  const [local] = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      authors: works.authors,
      firstPublishedYear: works.firstPublishedYear,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.olWorkKey, olWorkKey));

  let failure: string | null = null;
  let heading = local
    ? {
        title: local.title,
        authors: local.authors,
        year: local.firstPublishedYear,
        cover: local.coverUrl,
      }
    : null;

  // Both requests go through the same one-a-second queue, so this page takes
  // two seconds or so to render for a work that is not cached yet. loading.tsx
  // covers the wait.
  let fetched: Awaited<ReturnType<typeof getEditions>> = null;
  try {
    if (!heading) {
      const summary = await getWorkSummary(olWorkKey);
      if (!summary) notFound();
      heading = {
        title: summary.title,
        authors: summary.authors,
        year: summary.firstPublishedYear,
        cover: summary.coverId ? coverUrl(summary.coverId, "M") : null,
      };
    }
    fetched = await getEditions(olWorkKey);

    // An ISBN search names one edition, and on a work with more than a page of
    // them it may not be in the list. Fetched on its own and put first, so the
    // edition that brought someone here is the one they see chosen.
    const wanted = query.edition && isEditionKey(query.edition) ? query.edition : null;
    if (fetched && wanted && !fetched.editions.some((e) => e.olEditionKey === wanted)) {
      const extra = await getEdition(wanted);
      if (extra?.olWorkKey === olWorkKey) fetched.editions.unshift(extra);
    }
  } catch (error) {
    if (!(error instanceof OpenLibraryError)) throw error;
    failure = error.message;
  }

  // Without a heading there is nothing to add: the work is neither cached nor
  // reachable.
  if (!heading) {
    return (
      <main className="flex-1 p-6">
        <p role="status" className="max-w-2xl border-l-2 border-ink-dim pl-3 font-narrow">
          {failure}, and this work is not on your server yet, so there is nothing to add it
          from. Try again in a moment.
        </p>
      </main>
    );
  }

  const mine = local
    ? await db
        .select({ id: entries.id, olEditionKey: editions.olEditionKey, name: editions.name })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(and(eq(entries.userId, user.id), eq(editions.workId, local.id)))
    : [];
  const shelvedKeys = new Set(mine.flatMap((m) => (m.olEditionKey ? [m.olEditionKey] : [])));

  const chosenKey = query.edition && isEditionKey(query.edition) ? query.edition : null;
  const pickerEditions: PickerEdition[] = [...(fetched?.editions ?? [])]
    .sort(byYear)
    // The chosen edition leads, rather than being selected somewhere far down
    // a list of hundreds.
    .sort((a, b) => Number(b.olEditionKey === chosenKey) - Number(a.olEditionKey === chosenKey))
    .map((e) => ({
    key: e.olEditionKey,
    title: e.title,
    format: e.format,
    physicalFormat: e.physicalFormat,
    publisher: e.publisher,
    year: e.year,
    languageName: languageName(e.language),
    isbn: e.isbn13 ?? e.isbn10,
    pages: e.pages,
    coverId: e.coverId,
    narrators: e.narrators,
    onShelf: shelvedKeys.has(e.olEditionKey),
  }));

  // From an ISBN search the edition is already known; it arrives chosen, and
  // its format wins over the remembered one.
  const preselected = chosenKey ? pickerEditions.find((e) => e.key === chosenKey) : undefined;
  const remembered = (await cookies()).get(FORMAT_COOKIE)?.value;
  const defaultFormat: Format = preselected?.format ?? (isFormat(remembered) ? remembered : "book");

  const isbn = query.isbn ? parseIsbn(query.isbn) : null;

  return (
    <main className="flex-1 p-6">
      <header className="mb-8 flex items-start gap-4">
        <div className="h-24 w-16 shrink-0 bg-panel">
          {heading.cover ? (
            <Image
              src={heading.cover}
              alt=""
              width={64}
              height={96}
              className="h-24 w-16 object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-medium">{heading.title}</h1>
          {heading.authors.length > 0 ? <p>{heading.authors.join(", ")}</p> : null}
          <p className="font-narrow text-ink-dim">
            {[heading.year, local ? "Saved on this server" : "Open Library"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {mine.length > 0 ? (
        <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
          Already on your shelf:{" "}
          {mine.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Link href={`/edition/${m.id}`} className="underline hover:text-ink">
                {m.name}
              </Link>
            </span>
          ))}
          . Adding another edition gives it its own rating and reads.
        </p>
      ) : null}

      {failure ? (
        <p role="status" className="mb-6 max-w-2xl border-l-2 border-ink-dim pl-3 font-narrow">
          {failure}, so its editions cannot be listed. You can still add it as any edition.
        </p>
      ) : null}

      {fetched && fetched.total > fetched.editions.length ? (
        <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
          Open Library has {fetched.total} editions of this work; the first {EDITIONS_PAGE} are
          listed. For a particular one, search its ISBN.
        </p>
      ) : null}

      <AddForm
        olWorkKey={olWorkKey}
        workTitle={heading.title}
        isbn={isbn?.kind === "isbn" ? isbn.isbn.isbn13 : null}
        editions={pickerEditions}
        defaultFormat={defaultFormat}
        defaultEdition={preselected?.key ?? ""}
      />
    </main>
  );
}
