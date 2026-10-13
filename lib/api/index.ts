import { getCurrentUser, type SessionUser } from "@/lib/auth";

/**
 * The JSON API the phone app talks to. Every route under app/api goes through
 * withUser() or publicRoute(): the (app) layout's sign-in check does not reach
 * this far, so nothing here is guarded unless it asks to be.
 *
 * Errors are always `{ error: { code, message } }` with a matching status. The
 * web routes answer 404 to anyone signed out so they give nothing away; the API
 * answers 401, because the phone has to tell an expired token from a missing
 * game in order to show the sign-in screen.
 */

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "rate_limited"
  | "upstream"
  | "internal";

const STATUS_FOR: Readonly<Record<ErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 422,
  rate_limited: 429,
  upstream: 502,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: { fields?: Record<string, string>; retryAfterSeconds?: number } = {},
  ) {
    super(message);
  }
}

function errorResponse(error: ApiError): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (error.extra.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(error.extra.retryAfterSeconds));
  }

  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.extra.fields ? { fields: error.extra.fields } : {}),
      },
    },
    { status: STATUS_FOR[error.code], headers },
  );
}

/** Nothing personal is ever cacheable by anything between the server and the phone. */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

/** A JSON object body, or a 422 saying it is not one. */
export async function readObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("invalid", "The body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("invalid", "The body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

async function run(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // The detail goes to the server log, never to the client.
    console.error(error);
    return errorResponse(new ApiError("internal", "Something went wrong."));
  }
}

type Context<P> = { params: Promise<P> };

export function publicRoute<P = Record<string, never>>(
  handler: (request: Request, context: Context<P>) => Promise<Response>,
) {
  return (request: Request, context: Context<P>) => run(() => handler(request, context));
}

export function withUser<P = Record<string, never>>(
  handler: (request: Request, context: Context<P> & { user: SessionUser }) => Promise<Response>,
) {
  return (request: Request, context: Context<P>) =>
    run(async () => {
      const user = await getCurrentUser();
      if (!user) throw new ApiError("unauthorized", "Sign in again.");
      return handler(request, { ...context, user });
    });
}
