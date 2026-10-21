import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { inspectWorkRemoval } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

import { RemovalSummary } from "../../../removal-summary";
import { deleteBook } from "./actions";
import type { Metadata } from "next";
import { workTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

/** The book page's Delete is always the whole book; one edition goes from its own page. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return workTitle((await params).slug, "Delete");
}

export default async function DeleteWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const fromOffShelf = (await searchParams).from === "off-shelf";
  const back = fromOffShelf ? "/off-shelf" : `/work/${slug}`;

  const [work] = await db.select({ id: works.id, title: works.title }).from(works).where(eq(works.slug, slug));
  if (!work) notFound();

  const removal = await inspectWorkRemoval(work.id);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-4 font-display text-3xl">Delete {work.title}?</h1>

      <RemovalSummary removal={removal} />

      <form action={deleteBook} className="mt-6 flex items-center gap-4">
        <input type="hidden" name="workId" value={work.id} />
        {fromOffShelf ? <input type="hidden" name="from" value="off-shelf" /> : null}
        <button type="submit" className="btn btn-danger">
          Delete the book
        </button>
        <Link href={back} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </form>
    </main>
  );
}
