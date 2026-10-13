import { ApiError, json, withUser } from "@/lib/api";
import { comicvineEnabled, searchVolumes } from "@/lib/comicvine";

export const dynamic = "force-dynamic";

/**
 * `?q=` across Comic Vine's volumes — runs and collected editions — as the
 * web's comic tab searches. Ten at most. Without a key on the server this is a
 * 502 saying so. Anything showing these should credit Comic Vine (§4c).
 */
export const GET = withUser(async (request) => {
  if (!comicvineEnabled()) throw new ApiError("upstream", "This server has no Comic Vine key.");
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const volumes = term ? await searchVolumes(term) : [];
  return json({
    q: term,
    results: volumes.map((v) => ({
      volumeId: v.id,
      name: v.name,
      startYear: v.startYear,
      publisher: v.publisher,
      issueCount: v.issueCount,
      coverUrl: v.thumbUrl,
      deck: v.deck,
      pageUrl: v.pageUrl,
    })),
  });
});
