import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { seriesNames } from "@/lib/books/draft";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { AddTabs } from "./add-tabs";
import { EditionForm, type FixedWork } from "./edition-form";
import { FORMAT_COOKIE, isFormat } from "./format";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Both doors of the one add flow. Door A is "Add book" in the nav; Door B is
 * "Add edition" on a work page, which is this page with `?work=` — the same
 * form, with the work already decided.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ work?: string }> }): Promise<Metadata> {
  await requireUser();
  const { work } = await searchParams;
  if (work === undefined || !isUuid(work)) return { title: "Add a book" };
  const [row] = await db.select({ title: works.title }).from(works).where(eq(works.id, work));
  return { title: row ? `Add an edition of ${row.title}` : "Add a book" };
}

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; work?: string; title?: string }>;
}) {
  await requireUser();
  const query = await searchParams;

  let fixedWork: FixedWork | null = null;
  let workSlug: string | null = null;
  if (query.work !== undefined) {
    if (!isUuid(query.work)) notFound();
    const [work] = await db
      .select({
        id: works.id,
        slug: works.slug,
        title: works.title,
        authors: works.authors,
        olWorkKey: works.olWorkKey,
      })
      .from(works)
      .where(eq(works.id, query.work));
    if (!work) notFound();

    const rows = await db
      .select({ id: editions.id, name: editions.name, language: editions.language })
      .from(editions)
      .where(eq(editions.workId, work.id))
      .orderBy(asc(editions.createdAt));

    fixedWork = {
      id: work.id,
      title: work.title,
      authors: work.authors,
      olWorkKey: work.olWorkKey,
      editions: rows,
    };
    workSlug = work.slug;
  }

  const remembered = (await cookies()).get(FORMAT_COOKIE)?.value;

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-6 font-display text-3xl">
        {fixedWork ? (
          <>
            Add an edition of{" "}
            <Link href={`/work/${workSlug}`} className="underline hover:text-ink">
              {fixedWork.title}
            </Link>
          </>
        ) : (
          "Add a book"
        )}
      </h1>
      {fixedWork ? null : <AddTabs current="book" />}

      <EditionForm
        fixedWork={fixedWork}
        initialManual={query.type === "manual"}
        initialTitle={query.title?.slice(0, 500) ?? ""}
        defaultFormat={isFormat(remembered) ? remembered : "book"}
        seriesNames={fixedWork ? [] : await seriesNames()}
      />
    </main>
  );
}
