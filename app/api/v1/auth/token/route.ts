import { ApiError, json, publicRoute, readObject, withUser } from "@/lib/api";
import { checkCredentials } from "@/lib/auth/login";
import {
  createSession,
  generateSessionToken,
  invalidateSession,
  readBearerToken,
  validateSessionToken,
} from "@/lib/auth/session";
import { describeWait } from "@/lib/auth/throttle";

export const dynamic = "force-dynamic";

/**
 * Sign in from the phone: a username and password in, a device token out. The
 * token is shown once and stored only as a digest, like a browser session.
 */
export const POST = publicRoute(async (request) => {
  const body = await readObject(request);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // What Settings lists the device as. Trimmed and capped because it is shown
  // back on a page, and a phone's own name is all it needs to be.
  const deviceName =
    typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 80) : "";

  if (!username || !password) {
    throw new ApiError("invalid", "Enter a username and password.", {
      fields: {
        ...(username ? {} : { username: "Required." }),
        ...(password ? {} : { password: "Required." }),
      },
    });
  }

  const result = await checkCredentials(username, password);
  if (!result.ok) {
    if (result.reason === "throttled") {
      throw new ApiError("rate_limited", describeWait(result.retryAfterSeconds), {
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    throw new ApiError("unauthorized", "Username or password is incorrect.");
  }

  const token = generateSessionToken();
  await createSession(token, result.userId, { kind: "device", label: deviceName || null });

  const user = await validateSessionToken(token, "device");
  return json({ token, user }, { status: 201 });
});

/** Sign this device out. Other devices and the browser are left alone. */
export const DELETE = withUser(async () => {
  const token = await readBearerToken();
  if (token) await invalidateSession(token);
  return new Response(null, { status: 204 });
});
