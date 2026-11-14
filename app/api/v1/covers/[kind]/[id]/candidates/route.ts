import { ApiError, json, withUser } from "@/lib/api";
import { candidatesFor, searchCandidates } from "@/lib/books/cover-candidates";
import { coverTarget } from "@/lib/books/cover-changes";

export const dynamic = "force-dynamic";

/**
 * "Covers found", as the cover page's picker: `{ items: [{ source, ref, thumb,
 * label }] }`, the book's own first; with `?q=`, a search instead (Google
 * first). Send `source` and `ref` back to apply one. An unreachable catalogue
 * is an empty list, as the page shows.
 */
export const GET = withUser<{ kind: string; id: string }>(async (request, { params }) => {
  const { kind, id } = await params;
  const target = await coverTarget(kind, id);
  if (!target) throw new ApiError("not_found", "That book is no longer here.");
  const q = new URL(request.url).searchParams.get("q")?.trim();
  try {
    return json({ items: q ? await searchCandidates(q) : await candidatesFor(target) });
  } catch {
    return json({ items: [] });
  }
});
