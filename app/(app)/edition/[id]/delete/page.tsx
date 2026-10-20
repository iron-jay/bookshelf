import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { editionCount, inspectEditionRemoval, inspectWorkRemoval } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { RemovalSummary } from "../../../removal-summary";
import { deleteFromEdition } from "./actions";
import { DeleteChoice } from "./delete-choice";
import type { Metadata } from "next";
import { editionTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return editionTitle((await params).id, "Delete");
}

export default async function DeleteEditionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  // Postgres answers a malformed uuid with an error rather than an empty row.
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ name: editions.name, workId: works.id, workSlug: works.slug, workTitle: works.title })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, id));
  if (!row) notFound();

  const [workRemoval, editionRemoval, total] = await Promise.all([
    inspectWorkRemoval(row.workId),
    inspectEditionRemoval(id),
    editionCount(row.workId),
  ]);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${row.workSlug}`} className="underline">
          {row.workTitle}
        </Link>
      </p>
      <DeleteChoice
        action={deleteFromEdition}
        editionId={id}
        workTitle={row.workTitle}
        keepHref={`/edition/${id}`}
        workSummary={<RemovalSummary removal={workRemoval} />}
        editionSummary={
          // A book's last edition only goes with the book (§2).
          total > 1 ? (
            <div>
              <p className="mb-2 font-narrow">
                Only {row.name} goes. The book and its other editions stay.
              </p>
              <RemovalSummary removal={editionRemoval} />
            </div>
          ) : null
        }
      />
    </main>
  );
}
