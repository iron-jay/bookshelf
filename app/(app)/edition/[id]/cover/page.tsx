import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { backFor, CoverPage } from "../../../cover-page";

export const dynamic = "force-dynamic";

export default async function EditionCoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ edition: editions, work: works })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, id));
  if (!row) notFound();
  const { edition, work } = row;

  return (
    <CoverPage
      kind="edition"
      id={edition.id}
      title={work.title}
      author={work.authors.join(", ") || null}
      coverUrl={edition.coverUrl ?? work.coverUrl}
      hasOwnCover={Boolean(edition.coverUrl)}
      needsReview={edition.coverNeedsReview}
      note={!edition.coverUrl && work.coverUrl ? "This is the work’s cover. One set here is this edition’s own." : null}
      {...backFor((await searchParams).from, { href: `/edition/${edition.id}`, label: work.title })}
    />
  );
}
