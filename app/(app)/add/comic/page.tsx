import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { comicvineEnabled, searchVolumes } from "@/lib/comicvine";

import { AddTabs, ComicVineCredit } from "../add-tabs";

export const dynamic = "force-dynamic";

const FIELD = "w-full max-w-md field";

/**
 * Door A for comics: search Comic Vine's volumes (runs and collected
 * editions), then pick the issue — a single issue, a trade paperback, a
 * graphic novel — on the volume's page.
 */
export default async function AddComicPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const term = ((await searchParams).q ?? "").trim();
  const enabled = comicvineEnabled();
  const volumes = enabled && term ? await searchVolumes(term) : [];

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-4 font-display text-3xl">Add a comic or graphic novel</h1>
      <AddTabs current="comic" />

      {!enabled ? (
        <div className="flex max-w-2xl flex-col gap-2 font-narrow">
          <p>
            Comics are found on Comic Vine, which needs a free API key: make a Comic Vine account, get the key from
            comicvine.gamespot.com/api, and set <span className="font-mono">COMICVINE_API_KEY</span> in the
            server’s .env.
          </p>
          <p className="text-ink-dim">
            Until then,{" "}
            <Link href="/add?type=manual" className="underline hover:text-ink">
              create it by hand
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <form action="/add/comic" className="mb-6 flex gap-2">
            <input
              name="q"
              type="search"
              defaultValue={term}
              placeholder="Series or graphic novel title"
              aria-label="Search Comic Vine"
              autoFocus
              className={FIELD}
            />
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>

          {term && volumes.length === 0 ? (
            <p className="font-narrow text-ink-dim">
              Nothing found for “{term}”, or Comic Vine did not answer.{" "}
              <Link href={`/add?type=manual&title=${encodeURIComponent(term)}`} className="underline hover:text-ink">
                Create it by hand
              </Link>
              .
            </p>
          ) : null}

          <ul className="flex flex-col">
            {volumes.map((v) => (
              <li key={v.id} className="flex items-center gap-4 border-b border-line py-3">
                <div className="h-18 w-12 shrink-0 bg-panel">
                  {v.thumbUrl ? (
                    <Image src={v.thumbUrl} alt="" width={48} height={72} className="h-18 w-12 object-cover" unoptimized />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate">
                    {v.name}
                    {v.startYear ? <span className="ml-2 text-ink-dim">{v.startYear}</span> : null}
                  </p>
                  <p className="truncate font-narrow text-ink-dim">
                    {[v.publisher, v.issueCount === 1 ? "1 issue" : `${v.issueCount} issues`].filter(Boolean).join(" · ")}
                  </p>
                  {v.deck ? <p className="truncate font-narrow text-ink-dim">{v.deck}</p> : null}
                </div>
                <Link
                  href={`/add/comic/${v.id}`}
                  className="ml-auto shrink-0 btn btn-sm"
                >
                  {v.issueCount === 1 ? "Add" : "Choose"}
                </Link>
              </li>
            ))}
          </ul>
          <ComicVineCredit />
        </>
      )}
    </main>
  );
}
