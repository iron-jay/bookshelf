import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { shelvedEntryFor } from "@/lib/books/add-from-catalogue";
import { getBook, hardcoverEnabled } from "@/lib/hardcover";

import { addHardcoverBook } from "../../actions";
import { CatalogueAddForm } from "../../catalogue-add-form";
import { FORMAT_COOKIE, isFormat } from "../../format";

export const dynamic = "force-dynamic";

/** A book only Hardcover has, from search: what it is, then shelf and format. */
export default async function AddHardcoverPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || !hardcoverEnabled()) notFound();

  const book = await getBook(id);
  if (!book) {
    return (
      <main className="flex-1 p-6">
        <p className="font-narrow">
          Hardcover did not answer just now, or has no such book.{" "}
          <Link href="/search" className="underline hover:text-ink">
            Back to search
          </Link>
        </p>
      </main>
    );
  }

  const mine = await shelvedEntryFor(user.id, { hardcoverId: book.id });
  const remembered = (await cookies()).get(FORMAT_COOKIE)?.value;

  return (
    <main className="flex-1 p-6">
      <header className="mb-8 flex items-start gap-4">
        <div className="h-36 w-24 shrink-0 bg-panel">
          {book.imageUrl ? (
            <Image src={book.imageUrl} alt="" width={96} height={144} className="h-36 w-24 object-cover" unoptimized />
          ) : null}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-medium">{book.title}</h1>
          {book.authors.length > 0 ? <p>{book.authors.join(", ")}</p> : null}
          <p className="font-narrow text-ink-dim">
            {[
              book.series ? `${book.series.name}${book.series.position !== null ? ` #${book.series.position}` : ""}` : null,
              book.releaseYear,
              "Hardcover",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {book.description ? (
            <p className="mt-2 line-clamp-4 max-w-prose font-serif leading-relaxed">{book.description}</p>
          ) : null}
        </div>
      </header>

      {mine ? (
        <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
          Already on your shelf:{" "}
          <Link href={`/edition/${mine.editionId}`} className="underline hover:text-ink">
            open it
          </Link>
          . Adding it as the other of book or audiobook gives that its own rating and reads.
        </p>
      ) : null}

      <CatalogueAddForm
        action={addHardcoverBook}
        hidden={{ hardcoverId: String(book.id) }}
        withFormat
        defaultFormat={isFormat(remembered) ? remembered : "book"}
      />
    </main>
  );
}
