import Link from "next/link";

import { authDisabled, requireUser } from "@/lib/auth";

import { logout } from "./actions";

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
      {/* Search, Add and Settings join the nav as their build steps land, so it
          never links to a page that does not exist yet. */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <nav className="flex items-center gap-5">
          <Link href="/" className="font-medium">
            bookshelf
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
