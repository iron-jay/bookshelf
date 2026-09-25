/**
 * The add page waits on two queued Open Library requests — around two seconds
 * for a work that is not cached — so it says what it is waiting for.
 */
export default function Loading() {
  return (
    <main className="flex-1 p-6">
      <p className="font-narrow text-ink-dim">Asking Open Library for editions…</p>
    </main>
  );
}
