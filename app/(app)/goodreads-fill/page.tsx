import { requireUser } from "@/lib/auth";

import { GoodreadsFill } from "./goodreads-fill";

export const dynamic = "force-dynamic";

/** Opened by the Goodreads bookmarklet; see lib/goodreads-bookmarklet. */
export default async function GoodreadsFillPage() {
  await requireUser();
  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-xl font-medium">Fill in from Goodreads</h1>
      <GoodreadsFill />
    </main>
  );
}
