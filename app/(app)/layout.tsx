import Link from "next/link";

import { authDisabled, requireUser } from "@/lib/auth";

import { logout } from "./actions";
import { ShelfLink } from "./shelf-link";

/**
 * Everything in this route group is behind the session check. Guarding here
 * rather than in middleware keeps session validation on the Node runtime, where
 * the database client already lives.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = user.displayName ?? user.username;

  return (
    <>
      {/* Settings joins the nav when its build step lands, so the nav never
          links to a page that does not exist yet. */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <nav className="flex items-center gap-5">
          <ShelfLink className="font-medium">bookshelf</ShelfLink>
          <Link href="/search" className="font-narrow text-ink-dim hover:text-ink">
            Search
          </Link>
          <Link href="/add" className="font-narrow text-ink-dim hover:text-ink">
            Add book
          </Link>
        </nav>

        {authDisabled() ? (
          <span className="font-narrow text-ink-dim">{name} · sign-in off</span>
        ) : (
          <form action={logout} className="flex items-center gap-4">
            <span className="font-narrow text-ink-dim">{name}</span>
            <button type="submit" className="font-narrow text-ink-dim hover:text-ink">
              Sign out
            </button>
          </form>
        )}
      </header>

      {children}
    </>
  );
}
