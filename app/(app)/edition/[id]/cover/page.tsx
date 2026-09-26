import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { CoverPage } from "../../../cover-page";

export const dynamic = "force-dynamic";

export default async function EditionCoverPage({ params }: { params: Promise<{ id: string }> }) {
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
  const community = (COMMUNITY_EDITION_KINDS as readonly string[]).includes(edition.kind);

  return (
    <CoverPage
      kind="edition"
      id={edition.id}
      title={work.title}
      heading={community ? edition.name : work.title}
      author={work.authors.join(", ") || null}
      // The entry_cards rule: a fan translation shows its own art or none.
      coverUrl={edition.coverUrl ?? (community ? null : work.coverUrl)}
      band={community ? { name: edition.name, credit: edition.credit } : null}
      hasOwnCover={Boolean(edition.coverUrl)}
      needsReview={edition.coverNeedsReview}
      canLookUp={!community}
      note={
        community
          ? "A fan translation shows its own art or the typeset cover — never the book’s. Every cover found would be an official one, so there is nothing to choose from here."
          : !edition.coverUrl && work.coverUrl
            ? "This is the work’s cover. One set here is this edition’s own."
            : null
      }
      backHref={`/edition/${edition.id}`}
    />
  );
}
