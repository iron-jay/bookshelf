import { revalidatePath } from "next/cache";

/**
 * The pages a change from the phone shows up on, so a browser open on them
 * catches up the way it does after a server action.
 */
export function refreshEntryPages(editionId: string): void {
  revalidatePath(`/edition/${editionId}`);
  revalidatePath("/");
}

/** Every page a series or collection shows on, after the phone renames, removes or regroups one. */
export function refreshSeriesPages(): void {
  revalidatePath("/series/[slug]", "page");
  revalidatePath("/collection/[slug]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/edition/[id]", "page");
  revalidatePath("/");
}
