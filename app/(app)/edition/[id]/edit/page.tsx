import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, entries, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { EditForm, EditionFields, WorkFields } from "../../../edit-fields";
import { workFields } from "../../../edit-work-fields";
import { saveEditionDetails } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Everything about the book you hold, on one page with one Save: the book's
 * title and authors (shared by all its editions) and this edition's own.
 */
export default async function EditEditionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ edition: editions, work: works, entryId: entries.id })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .leftJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
    .where(eq(editions.id, id));
  if (!row) notFound();
  const { edition, work } = row;
  // Not on your shelf: only the book's own details are yours to correct.
  if (!row.entryId) redirect(`/work/${encodeURIComponent(work.slug)}/edit`);

  const others = await db
    .select({ id: editions.id, name: editions.name })
    .from(editions)
    .where(eq(editions.workId, work.id))
    .orderBy(asc(editions.createdAt));
  const community = (COMMUNITY_EDITION_KINDS as readonly string[]).includes(edition.kind);
  const heading = community ? edition.name : work.title;
  const back = `/edition/${edition.id}`;

  return (
    <main className="flex-1 p-6">
      <p className="mb-2 font-narrow">
        <Link href={back} className="text-ink-dim underline hover:text-ink">
          Back to {heading}
        </Link>
      </p>
      <h1 className="mb-6 text-xl font-medium">Edit {heading}</h1>
      <EditForm action={saveEditionDetails} hidden={{ editionId: edition.id }} backHref={back}>
        <WorkFields
          work={workFields(work)}
          heading={community ? "The book it translates — shared by all its editions" : "The book — shared by all its editions"}
        />
        <EditionFields
          edition={{
            name: edition.name,
            kind: edition.kind,
            credit: edition.credit,
            language: edition.language,
            publisher: edition.publisher,
            publishedOn: edition.publishedOn,
            pages: edition.pages,
            durationMinutes: edition.durationMinutes,
            isbn13: edition.isbn13,
            url: edition.url,
            notes: edition.notes,
            baseEditionId: edition.baseEditionId,
          }}
          otherEditions={others.filter((o) => o.id !== edition.id)}
          heading="This edition"
        />
      </EditForm>
    </main>
  );
}
