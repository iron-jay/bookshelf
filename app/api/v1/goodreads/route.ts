import { json, withUser } from "@/lib/api";
import { EXTRACT_SOURCE } from "@/lib/goodreads-bookmarklet";

export const dynamic = "force-dynamic";

/**
 * The bookmarklet's own `extract`, as source text, for the phone to run on a
 * Goodreads page open in its own web view (brief §4b): the page is read on the
 * phone, as the extension reads it in Firefox, and this server never fetches
 * Goodreads. Served rather than copied so the phone reads pages as the web does.
 */
export const GET = withUser(async () => json({ extract: EXTRACT_SOURCE }));
