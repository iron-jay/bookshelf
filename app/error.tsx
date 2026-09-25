"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

/**
 * What a failed request looks like instead of a bare 500.
 *
 * It sits at the root so it also catches the app layout, which is where the
 * session lookup runs — the first query of every request, and so the first
 * thing to fail when the database is unreachable.
 *
 * Next strips a server error's message before it reaches the browser, which is
 * right and means this component cannot read the Postgres code. So it asks
 * instead: /health is a query and nothing else, and its answer separates "the
 * database is down" from "something in bookshelf is broken" — two problems with
 * nothing in common except the status code.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [database, setDatabase] = useState<"checking" | "up" | "down">("checking");
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    let current = true;

    fetch("/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { database?: boolean }) => {
        if (current) setDatabase(body.database ? "up" : "down");
      })
      // A health check that cannot be reached is not evidence about the
      // database, so it stays unattributed rather than guessing.
      .catch(() => {
        if (current) setDatabase("up");
      });

    return () => {
      current = false;
    };
  }, []);

  return (
    <main className="flex-1 p-6">
      <div className="flex max-w-xl flex-col gap-4">
        {database === "down" ? (
          <>
            <h1 className="text-xl font-medium">bookshelf cannot reach its database</h1>
            <p className="font-narrow text-ink-dim">
              Nothing on your shelf is lost — the app simply has nothing to read from. Postgres
              restarting takes a moment to replay its log, and this clears on its own when it
              finishes.
            </p>
            <p className="font-narrow text-ink-dim">
              If it does not, <span className="font-mono">docker compose logs db</span> on the
              server says why. A container stuck restarting, or a full disk, is the version of
              this that needs you.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium">Something went wrong</h1>
            <p className="font-narrow text-ink-dim">
              {database === "checking"
                ? "Checking whether the database is answering…"
                : "The database is answering, so this is bookshelf's own fault. The server log has the error in full."}
            </p>
          </>
        )}

        {error.digest ? (
          <p className="font-narrow text-ink-dim">
            Find it in the log by <span className="font-mono">{error.digest}</span>.
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          {/* reset() on its own re-renders the boundary against the payload it
              already has, which is the failed one — so the page fails again the
              instant the database comes back. refresh() is what actually asks
              the server a second time. */}
          <button
            type="button"
            disabled={retrying}
            onClick={() =>
              startRetry(() => {
                router.refresh();
                reset();
              })
            }
            className="border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim"
          >
            {retrying ? "Trying…" : "Try again"}
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              a full load on purpose: a client navigation would reuse the router
              state that just produced this page. */}
          <a href="/" className="font-narrow text-ink-dim underline hover:text-ink">
            Back to the shelf
          </a>
        </div>
      </div>
    </main>
  );
}
