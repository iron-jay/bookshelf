/**
 * The only place in the app that talks to openlibrary.org (brief §4).
 *
 * Every request goes through one queue, spaced a second apart. A person
 * searching will never notice; the Goodreads import, which can issue hundreds
 * of lookups, must wait its turn rather than fan out.
 */
import { version } from "@/package.json";
import { createSerialiser } from "@/lib/rate-limit";

const BASE = "https://openlibrary.org";
const TIMEOUT_MS = 15_000;

const serialise = createSerialiser(1000);

/**
 * Open Library asks clients to identify themselves and gives identified ones
 * more headroom. With no contact configured the repository stands in, so the
 * request is still traceable to a project rather than anonymous.
 */
function userAgent(): string {
  const contact = process.env.OPENLIBRARY_CONTACT?.trim() || "+https://github.com/iron-jay/bookshelf";
  return `bookshelf/${version} (${contact})`;
}

export class OpenLibraryError extends Error {
  constructor(
    message: string,
    /** Absent when there was no response at all: offline, DNS, timeout. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenLibraryError";
  }
}

/**
 * GETs a JSON document. `null` means Open Library answered and has no such
 * thing; anything else going wrong throws, so a caller can never mistake "the
 * network is down" for "this ISBN does not exist".
 */
export async function getJson<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T | null> {
  const url = new URL(path, BASE);
  for (const [name, value] of Object.entries(params ?? {})) url.searchParams.set(name, value);

  return serialise(async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": userAgent(), Accept: "application/json" },
        // /isbn/{isbn}.json answers with a redirect to /books/{key}.json.
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new OpenLibraryError(
        error instanceof Error && error.name === "TimeoutError"
          ? `Open Library did not answer within ${TIMEOUT_MS / 1000}s`
          : "Could not reach Open Library",
      );
    }

    // A 404 here is an HTML page, not JSON, so it is decided on the status
    // before anything tries to parse the body.
    if (response.status === 404) return null;

    if (!response.ok) {
      throw new OpenLibraryError(`Open Library answered ${response.status}`, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new OpenLibraryError("Open Library sent something that was not JSON", response.status);
    }
  });
}
