import { json, withUser } from "@/lib/api";
import { settingsSummary } from "@/lib/books/settings-summary";

export const dynamic = "force-dynamic";

/**
 * What Settings says beside each section: `offShelf` (books here on none of
 * your shelves), `flaggedCovers`, `placeholders` (covers "Find missing covers"
 * could fill), `hardcoverOn` and `hardcoverPending`, `entries`, and
 * `unmatched` (imported books that matched nothing: `title`, `slug`, `authors`).
 */
export const GET = withUser(async (_request, { user }) => json(await settingsSummary(user.id)));
