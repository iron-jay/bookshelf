import { ApiError, json, readObject, withUser } from "@/lib/api";
import { renameAccount } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_request, { user }) =>
  json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  }),
);

/**
 * Settings → Account: `{ username, displayName }`, as the page's form. A
 * refusal is `invalid` with the page's message; saved, the account as GET has it.
 */
export const PATCH = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const result = await renameAccount(user.id, text(body.username), text(body.displayName));
  if (!result.ok) throw new ApiError("invalid", result.message);
  const displayName = text(body.displayName).trim();
  return json({ id: user.id, username: text(body.username).trim(), displayName: displayName || null, isAdmin: user.isAdmin });
});
