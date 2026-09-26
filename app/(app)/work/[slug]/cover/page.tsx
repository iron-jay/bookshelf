import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

import { CoverPage } from "../../../cover-page";

export const dynamic = "force-dynamic";

export default async function WorkCoverPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.slug, decodeURIComponent(slug)));
  if (!work) notFound();

  return (
    <CoverPage
      kind="work"
      id={work.id}
      title={work.title}
      heading={work.title}
      author={work.authors.join(", ") || null}
      coverUrl={work.coverUrl}
      band={null}
      hasOwnCover={Boolean(work.coverUrl)}
      needsReview={work.coverNeedsReview}
      canLookUp
      note="The work’s cover shows for any edition without its own. Fan translations never use it."
      backHref={`/work/${work.slug}`}
    />
  );
}
