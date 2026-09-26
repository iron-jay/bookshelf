import { and, asc, count, countDistinct, eq, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";

import { authDisabled, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, entryCards, works } from "@/lib/db/schema";

import { hardcoverEnabled } from "@/lib/hardcover";

import { AccountForm } from "./account-form";
import { GoodreadsImport } from "./goodreads-import";
import { HardcoverFill } from "./hardcover-fill";
import { MissingCovers } from "./missing-covers";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const hardcoverOn = hardcoverEnabled();
  const [hardcoverPending] = hardcoverOn
    ? await db
        .select({ n: countDistinct(works.id) })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .innerJoin(works, eq(works.id, editions.workId))
        .where(and(eq(entries.userId, user.id), eq(works.source, "local"), isNull(works.hardcoverId)))
    : [{ n: 0 }];

  const [entryTotal] = await db.select({ n: count() }).from(entries).where(eq(entries.userId, user.id));
  // entry_cards already says whether the cover on screen for each entry is
  // flagged, whichever row it belongs to.
  const [flagged] = await db
    .select({ n: count() })
    .from(entryCards)
    .where(and(eq(entryCards.userId, user.id), eq(entryCards.coverNeedsReview, true)));
  const flaggedCovers = flagged.n;
  const [placeholders] = await db
    .select({ n: count() })
    .from(entryCards)
    .where(
      and(eq(entryCards.userId, user.id), isNull(entryCards.coverUrl), eq(entryCards.isCommunityEdition, false)),
    );

  // Goodreads rows that matched nothing became local works (§5). Read from the
  // data rather than kept from the run, so the list survives a closed tab or
  // a restart: an edition with a Goodreads id whose work is local is one.
  const unmatched = await db
    .select({ editionId: editions.id, title: works.title, slug: works.slug, authors: works.authors })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .innerJoin(works, eq(works.id, editions.workId))
    .where(
      and(
        eq(entries.userId, user.id),
        isNotNull(editions.goodreadsBookId),
        eq(works.source, "local"),
        // Found by ISBN but given a work of its own (Open Library's was a
        // catch-all): matched, so not listed.
        isNull(editions.olEditionKey),
        // Filled in from Hardcover: matched there, so not listed either.
        isNull(works.hardcoverId),
      ),
    )
    .orderBy(asc(works.title));

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-xl font-medium">Settings</h1>

      <div className="flex max-w-2xl flex-col gap-10">
        <section>
          <h2 className="mb-2 font-medium">Account</h2>
          <p className="font-narrow text-ink-dim">
            Signed in as {user.username}
            {user.isAdmin ? " · admin" : ""}
          </p>
          <AccountForm username={user.username} displayName={user.displayName} />

          <h3 className="mt-8 font-medium">Password</h3>
          <PasswordForm />
          {authDisabled() ? (
            <p className="mt-2 border-l-2 border-ink-dim pl-3 font-narrow">
              Sign-in is off (<span className="font-mono">AUTH_DISABLED</span>). Anything that can
              reach this port can read, edit and delete without a password — the point on a private
              network, and a problem anywhere else.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-1 font-medium">Cover art</h2>
          <p className="font-narrow text-ink-dim">
            {flaggedCovers === 0
              ? "No covers waiting for review."
              : `${flaggedCovers} ${flaggedCovers === 1 ? "cover was" : "covers were"} found by title and may be the wrong book.`}{" "}
            <Link href="/art" className="underline hover:text-ink">
              Review cover art
            </Link>
          </p>
          {hardcoverOn ? (
            <>
              <h3 className="mt-6 font-medium">From Hardcover</h3>
              <HardcoverFill pending={hardcoverPending.n} />
              <h3 className="mt-6 font-medium">Missing covers</h3>
            </>
          ) : null}
          <MissingCovers missing={placeholders.n} />
        </section>

        <section>
          <h2 className="mb-1 font-medium">Import from Goodreads</h2>
          <p className="font-narrow text-ink-dim">
            On Goodreads: My Books → Import and export → Export Library, then download the .csv.
            Books are matched by ISBN, then by title and author; anything that matches nothing is
            added as a local work and listed below to fix. Shelves become tags, ratings are doubled
            to out of ten, and series come from titles like “Guards! Guards! (Discworld, #8)”.
          </p>
          <GoodreadsImport />

          {unmatched.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-medium">Added as local works</h3>
              <p className="mb-2 font-narrow text-ink-dim">
                {unmatched.length} imported {unmatched.length === 1 ? "book" : "books"} matched
                nothing on Open Library{hardcoverOn ? " or Hardcover" : ""}. They are on your shelf as they were on Goodreads; check the
                title and author, or add the right Open Library edition from the work page.
              </p>
              <ul className="flex flex-col font-narrow">
                {unmatched.map((u) => (
                  <li key={u.editionId} className="border-b border-line py-1">
                    <Link href={`/work/${u.slug}`} className="underline hover:text-ink">
                      {u.title}
                    </Link>
                    {u.authors.length ? <span className="text-ink-dim"> · {u.authors.join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="mb-1 font-medium">Export</h2>
          <p className="mb-3 font-narrow text-ink-dim">
            {entryTotal.n} {entryTotal.n === 1 ? "entry" : "entries"}. Plain downloads you could curl
            too. Open Library’s raw data is left out: it is theirs and can be fetched again.
          </p>
          {/* Route handlers returning attachments: next/link would navigate
              client-side and never start a download. */}
          <p className="flex gap-3">
            <a href="/export/json" download className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim">
              Download JSON
            </a>
            <a href="/export/csv" download className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim">
              Download CSV
            </a>
          </p>
          <p className="mt-2 font-narrow text-ink-dim">
            JSON keeps every read and field. CSV is one row per book on your shelf, reads summarised.
          </p>
        </section>
      </div>
    </main>
  );
}
