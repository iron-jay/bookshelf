import { revalidatePath } from "next/cache";

/**
 * The pages a change from the phone shows up on, so a browser open on them
 * catches up the way it does after a server action.
 */
export function refreshEntryPages(editionId: string): void {
  revalidatePath(`/edition/${editionId}`);
  revalidatePath("/");
}
