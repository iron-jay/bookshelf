import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

import { backFor, CoverPage } from "../../../cover-page";

export const dynamic = "force-dynamic";

export default async function WorkCoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
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
      author={work.authors.join(", ") || null}
      coverUrl={work.coverUrl}
      hasOwnCover={Boolean(work.coverUrl)}
      needsReview={work.coverNeedsReview}
      note="The work’s cover shows for any edition without its own."
      {...backFor((await searchParams).from, { href: `/work/${encodeURIComponent(work.slug)}`, label: work.title })}
    />
  );
}
