import { json, withUser } from "@/lib/api";
import { offShelfBooks } from "@/lib/books/off-shelf";

export const dynamic = "force-dynamic";

/**
 * Books not on your shelf (`/off-shelf`): every book here with no entry of
 * yours. `editionId` is set when it has exactly one edition, so one press
 * shelves it (`POST /off-shelf/{workId}`); otherwise open it to choose.
 */
export const GET = withUser(async (_request, { user }) => json({ items: await offShelfBooks(user.id) }));
