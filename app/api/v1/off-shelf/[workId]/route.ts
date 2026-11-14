import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { shelveOffShelfBook } from "@/lib/books/off-shelf";
import { isShelf } from "@/lib/shelves";

export const dynamic = "force-dynamic";

/** One press on Books not on your shelf: `{ shelf }` puts its one edition there. 200 with `{ editionId }`. */
export const POST = withUser<{ workId: string }>(async (request, { params, user }) => {
  const workId = uuidParam((await params).workId, "book");
  const { shelf } = await readObject(request);
  if (!isShelf(shelf)) throw new ApiError("invalid", "Choose a shelf.", { fields: { shelf: "A shelf." } });
  const editionId = await shelveOffShelfBook(user.id, workId, shelf);
  if (!editionId) throw new ApiError("invalid", "Open it to choose an edition first.");
  revalidatePath("/");
  revalidatePath("/off-shelf");
  return json({ editionId });
});
