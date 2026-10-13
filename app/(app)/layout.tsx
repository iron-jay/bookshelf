import { Suspense } from "react";

import Link from "next/link";

import { authDisabled, requireUser } from "@/lib/auth";

import { logout } from "./actions";
import { MainNav, TabBar } from "./main-nav";
import { ShelfLink } from "./shelf-link";

/**
 * Everything in this route group is behind the session check. Guarding here
 * rather than in middleware keeps session validation on the Node runtime, where
 * the database client already lives.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // The two apps are a pair; when the other one's address is known, it is one
  // click away. Read at request time so the same image serves any network.
  const sibling = process.env.GAMESHELF_URL?.trim() || null;

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-7 gap-y-2 px-4 py-3 sm:px-10 sm:py-4">
        <ShelfLink className="font-display text-2xl">bookshelf</ShelfLink>

        <Suspense fallback={null}>
          <MainNav />
        </Suspense>

        <div className="flex-1" />

        {/* Goes out to Open Library. The shelf's own filter box is the other
            thing: that one narrows what you already have. */}
        <form action="/search" className="hidden w-72 md:block">
          <label>
            <span className="sr-only">Find or add a book</span>
            <input
              name="q"
              type="search"
              placeholder="Find or add a book"
              className="field rounded-full px-4"
            />
          </label>
        </form>

        {sibling ? (
          <a href={sibling} className="font-narrow text-ink-dim hover:text-ink">
            gameshelf
          </a>
        ) : null}

        <Link href="/settings" className="hidden font-narrow text-ink-dim hover:text-ink sm:inline">
          Settings
        </Link>

        {authDisabled() ? null : (
          <form action={logout} className="flex items-center gap-4">
            <span className="hidden font-narrow text-ink-dim lg:inline">
              {user.displayName ?? user.username}
            </span>
            <button type="submit" className="font-narrow text-ink-dim hover:text-ink">
              Sign out
            </button>
          </form>
        )}
      </header>

      {/* Room at the bottom for the tab bar, which only a phone gets. */}
      <div className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</div>

      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
    </>
  );
}
