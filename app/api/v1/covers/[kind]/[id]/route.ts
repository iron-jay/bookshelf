import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import {
  applyCandidate,
  approveCoverOf,
  coverFromAddress,
  coverTarget,
  lookUpAgain,
  removeCoverOf,
  uploadCoverBytes,
  type CoverResult,
} from "@/lib/books/cover-changes";
import type { CoverTarget } from "@/lib/books/covers";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Params = { kind: string; id: string };

async function target(params: Promise<Params>): Promise<CoverTarget> {
  const { kind, id } = await params;
  const found = await coverTarget(kind, id);
  if (!found) throw new ApiError("not_found", "That book is no longer here.");
  return found;
}

/** The cover page's state: what shows, whether it is its own, and the note the page gives. */
async function coverState(t: CoverTarget) {
  if (t.kind === "work") {
    const [work] = await db.select().from(works).where(eq(works.id, t.id));
    return {
      coverUrl: work.coverUrl,
      hasOwnCover: Boolean(work.coverUrl),
      needsReview: work.coverNeedsReview,
      note: null,
      title: work.title,
      author: work.authors.join(", ") || null,
      seedTerm: [work.title, work.authors[0]].filter(Boolean).join(" "),
    };
  }
  const [row] = await db
    .select({ edition: editions, work: works })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, t.id));
  const { edition, work } = row;
  return {
    coverUrl: edition.coverUrl ?? work.coverUrl,
    hasOwnCover: Boolean(edition.coverUrl),
    needsReview: edition.coverNeedsReview,
    note: !edition.coverUrl && work.coverUrl ? "This is the work’s cover. One set here is this edition’s own." : null,
    title: work.title,
    author: work.authors.join(", ") || null,
    seedTerm: [work.title, work.authors[0]].filter(Boolean).join(" "),
  };
}

/**
 * `/work/{slug}/cover` or `/edition/{id}/cover` as data, `kind` being `work`
 * or `edition` and `id` its id: `coverUrl`, `hasOwnCover`, `needsReview`,
 * `note`, `title`, `author` and `seedTerm` (what the picker's search starts
 * with). Candidates are `GET …/candidates`.
 */
export const GET = withUser<Params>(async (_request, { params }) => json(await coverState(await target(params))));

/**
 * Changes the cover, as the page's buttons: a JSON body `{ do: "candidate",
 * source, ref }` (from the candidates; the server builds the address),
 * `{ do: "address", url }`, `{ do: "lookup" }`, `{ do: "remove" }` or
 * `{ do: "approve" }` ("It's right"); or a multipart body with the image as
 * `cover` (8 MB at most). Answers `{ ok, message, cover }`, the page's message
 * and the state after; `ok: false` is a refusal said in the page's words.
 */
export const POST = withUser<Params>(async (request, { params }) => {
  const t = await target(params);
  let result: CoverResult;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("cover");
    if (!(file instanceof File) || file.size === 0) result = { ok: false, message: "Choose an image first." };
    else result = await uploadCoverBytes(t, new Uint8Array(await file.arrayBuffer()));
  } else {
    const body = await readObject(request);
    const text = (name: string) => (typeof body[name] === "string" ? (body[name] as string).trim() : "");
    switch (body.do) {
      case "candidate":
        result = await applyCandidate(t, text("source"), text("ref"));
        break;
      case "address":
        result = await coverFromAddress(t, text("url"));
        break;
      case "lookup":
        result = await lookUpAgain(t);
        break;
      case "remove":
        result = await removeCoverOf(t);
        break;
      case "approve":
        await approveCoverOf(t);
        result = { ok: true, message: "Marked as right." };
        break;
      default:
        throw new ApiError("invalid", "do is candidate, address, lookup, remove or approve.", {
          fields: { do: "candidate, address, lookup, remove or approve." },
        });
    }
  }
  revalidatePath("/", "layout");
  return json({ ...result, cover: await coverState(t) });
});
