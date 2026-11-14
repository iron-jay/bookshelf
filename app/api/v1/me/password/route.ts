import { ApiError, json, readObject, withUser } from "@/lib/api";
import { changeAccountPassword } from "@/lib/auth/account";
import { readBearerToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Settings → Password: `{ currentPassword, newPassword, confirmPassword }`.
 * Every other signed-in device is signed out; this one stays. A refusal is
 * `invalid` with the page's message.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const result = await changeAccountPassword(
    user.id,
    { current: text(body.currentPassword), next: text(body.newPassword), confirm: text(body.confirmPassword) },
    await readBearerToken(),
  );
  if (!result.ok) throw new ApiError("invalid", result.message);
  return json(result);
});
