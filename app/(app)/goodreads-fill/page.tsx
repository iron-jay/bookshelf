import { requireUser } from "@/lib/auth";

import { GoodreadsFill } from "./goodreads-fill";

export const dynamic = "force-dynamic";

/** Opened by the Goodreads bookmarklet; see lib/goodreads-bookmarklet. */
export default async function GoodreadsFillPage() {
  await requireUser();
  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-6 font-display text-3xl">Fill in from Goodreads</h1>
      <GoodreadsFill />
    </main>
  );
}
