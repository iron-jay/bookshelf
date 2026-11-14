import { json, withUser } from "@/lib/api";
import { revokeDeviceSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Sign a phone out, for one that is lost or no longer yours; only your own. */
export const DELETE = withUser<{ id: string }>(async (_request, { params, user }) => {
  await revokeDeviceSession(user.id, (await params).id);
  return json({ ok: true });
});
