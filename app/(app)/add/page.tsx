import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { EditionForm, type DoorAType, type FixedWork } from "./edition-form";
import { FORMAT_COOKIE, isFormat } from "./format";

export const dynamic = "force-dynamic";

/**
 * Both doors of the one add flow. Door A is "Add book" in the nav; Door B is
 * "Add edition" on a work page, which is this page with `?work=` — the same
 * form, with the work already decided.
 */
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
  const type: DoorAType = query.type === "fan_translation" ? "fan_translation" : "book";

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-xl font-medium">
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

      <EditionForm
        fixedWork={fixedWork}
        initialType={type}
        initialManual={query.type === "manual"}
        initialTitle={query.title?.slice(0, 500) ?? ""}
        defaultFormat={isFormat(remembered) ? remembered : "book"}
      />
    </main>
  );
}
