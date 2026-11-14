import { json, withUser } from "@/lib/api";
import { authDisabled } from "@/lib/auth";
import { listDeviceSessions, readBearerToken, sessionIdOf } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Settings → Signed-in devices: each phone signed in, newest use first, with
 * `current` on the one asking. `authDisabled` says sign-in is off
 * (`AUTH_DISABLED`), which Settings warns about.
 */
export const GET = withUser(async (_request, { user }) => {
  const token = await readBearerToken();
  const mine = token ? sessionIdOf(token) : null;
  const devices = await listDeviceSessions(user.id);
  return json({
    authDisabled: authDisabled(),
    items: devices.map((d) => ({
      id: d.id,
      label: d.label,
      createdAt: d.createdAt.toISOString(),
      lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
      current: d.id === mine,
    })),
  });
});
