import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth";

import { FORMAT_COOKIE, isFormat } from "../add/format";

import { GoodreadsFill } from "./goodreads-fill";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/** Opened by the Goodreads bookmarklet and the Firefox extension; see lib/goodreads-bookmarklet. */
export const metadata: Metadata = { title: "From Goodreads" };

export default async function GoodreadsFillPage() {
  await requireUser();
  const remembered = (await cookies()).get(FORMAT_COOKIE)?.value;
  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-6 font-display text-3xl">From Goodreads</h1>
      <GoodreadsFill rememberedFormat={isFormat(remembered) ? remembered : "book"} />
    </main>
  );
}
