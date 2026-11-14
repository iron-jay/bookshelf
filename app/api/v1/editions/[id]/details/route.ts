import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { EDITION_FIELDS, editionEditForm, formFrom, saveEditionDetails, WORK_FIELDS } from "@/lib/books/edit-details";

export const dynamic = "force-dynamic";

/**
 * `/edition/{id}/edit` as data: `work` and `edition` (the fields as the form
 * has them, strings), and the choices for `kind`, `language` and
 * `baseEditionId`. Only for an edition on your shelf (`forbidden`, as the page
 * sends you to the book's own details instead).
 */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "edition");
  const form = await editionEditForm(user.id, id);
  if (!form) throw new ApiError("forbidden", "Add it to your shelf first.");
  return json(form);
});

/**
 * `{ work: {...}, edition: {...} }`: the book's details and this edition's,
 * saved together or not at all, by the page's rules. A refusal is `invalid`
 * with the page's message. Answers as GET.
 */
export const PUT = withUser<{ id: string }>(async (request, { params, user }) => {
  const id = uuidParam((await params).id, "edition");
  const body = await readObject(request);
  const part = (name: string) => {
    const value = body[name];
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  };
  const form = formFrom(part("work"), WORK_FIELDS);
  for (const [name, value] of formFrom(part("edition"), EDITION_FIELDS)) form.set(name, value);
  const result = await saveEditionDetails(user.id, id, form);
  if (!result.ok) {
    throw new ApiError(result.error === "Add it to your shelf first." ? "forbidden" : "invalid", result.error);
  }
  revalidatePath("/", "layout");
  return json(await editionEditForm(user.id, id));
});
