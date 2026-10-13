import Link from "next/link";

/**
 * Every unknown URL, and every `notFound()` a page calls for a slug that does
 * not resolve — a deleted work, a mistyped series, an edition from someone
 * else's export.
 */
export default function NotFound() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="font-display text-3xl">Nothing here</h1>
        <p className="font-narrow text-ink-dim">
          This page does not exist, or what it pointed at has been removed.
        </p>
        <Link href="/" className="font-narrow text-ink-dim underline hover:text-ink">
          Back to the shelf
        </Link>
      </div>
    </main>
  );
}
