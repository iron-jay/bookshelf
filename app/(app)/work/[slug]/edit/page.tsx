import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

import { EditForm, WorkFields } from "../../../edit-fields";
import { workFields } from "../../../edit-work-fields";
import { saveWorkDetails } from "./actions";

export const dynamic = "force-dynamic";

/** A work's details on a page of their own: reached by "Edit details" on the work page. */
export default async function EditWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.slug, decodeURIComponent(slug)));
  if (!work) notFound();
  const back = `/work/${work.slug}`;

  return (
    <main className="flex-1 p-6">
      <p className="mb-2 font-narrow">
        <Link href={back} className="text-ink-dim underline hover:text-ink">
          Back to {work.title}
        </Link>
      </p>
      <h1 className="mb-2 text-xl font-medium">Edit {work.title}</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        These are the book’s details, shared by every edition of it. An edition’s own name, language and
        the rest are edited from that edition’s page.
      </p>
      <EditForm action={saveWorkDetails} hidden={{ workId: work.id }} backHref={back}>
        <WorkFields work={workFields(work)} heading={null} />
      </EditForm>
    </main>
  );
}
