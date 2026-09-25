import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Must be absolute, in dev as well as in the container.
 *
 * Resolving a relative path would mean joining against `process.cwd()`, and the
 * bundler reads that as "this filesystem access is scoped to the project" and
 * traces the entire tree into the server bundle. Covers are runtime data on a
 * bind mount and belong outside the project anyway.
 */
export function coversDir(): string {
  const configured = process.env.COVERS_DIR;
  if (!configured) {
    throw new Error("COVERS_DIR is not set");
  }
  if (!path.isAbsolute(configured)) {
    throw new Error(`COVERS_DIR must be an absolute path, got "${configured}"`);
  }
  return configured;
}

/**
 * Covers are runtime data on a bind mount, never build input. Without the
 * opt-out the bundler treats a computed filesystem path as a directory asset
 * and tries to walk the whole project into the server bundle.
 */
function coverPath(filename: string): string {
  return path.join(/* turbopackIgnore: true */ coversDir(), filename);
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Guards the cover route against path traversal and anything not written here. */
export const COVER_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  return (
    Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === ext) ?? "application/octet-stream"
  );
}

/**
 * A Blob rather than the raw bytes: since TypeScript 5.7 a Node Buffer is a
 * `Uint8Array<ArrayBufferLike>`, which is not assignable to `BodyInit`, and a
 * Blob is the way through that without an assertion.
 */
export async function readCover(filename: string): Promise<Blob> {
  return new Blob([await readFile(coverPath(filename))]);
}

/**
 * Anything smaller is a placeholder, not a cover — Open Library's "no image"
 * is a 43-byte gif — and anything larger is not a book cover.
 */
const MIN_COVER_BYTES = 1024;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * What the bytes are, from their first few, not from what a header or a
 * browser claimed: an upload named cover.jpg can be anything, and a server
 * answering image/jpeg for an HTML error page is common.
 */
function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type StoreResult = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Writes a cover under a fresh name and returns its public path
 * ("/covers/{uuid}.jpg"). A new name every time, never the row's id: a
 * replaced cover then has a new URL, so browsers never show the old one and
 * the route can cache files forever.
 */
export async function storeCover(bytes: Uint8Array): Promise<StoreResult> {
  if (bytes.byteLength < MIN_COVER_BYTES) return { ok: false, reason: "That image is too small to be a cover." };
  if (bytes.byteLength > MAX_COVER_BYTES) return { ok: false, reason: "That image is larger than 8 MB." };
  const type = sniff(bytes);
  if (!type) return { ok: false, reason: "That is not a JPEG, PNG or WebP image." };

  const filename = `${randomUUID()}.${EXTENSIONS[type]}`;
  await mkdir(coversDir(), { recursive: true });
  await writeFile(coverPath(filename), bytes);
  return { ok: true, path: `/covers/${filename}` };
}

/**
 * Downloads an image once and stores it — covers are never hot-linked (§4a).
 * Returns a reason on failure rather than throwing: a missing cover is not
 * worth failing an add over, and a pasted URL deserves to be told why.
 */
export async function downloadCover(url: string): Promise<StoreResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      // Open Library's cover host answers with two redirects to archive.org.
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "image/jpeg,image/png,image/webp" },
    });
  } catch {
    return { ok: false, reason: "That address did not answer." };
  }
  if (!res.ok) return { ok: false, reason: `That address answered ${res.status}.` };

  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_COVER_BYTES) return { ok: false, reason: "That image is larger than 8 MB." };
  return storeCover(new Uint8Array(await res.arrayBuffer()));
}

/** Deletes a stored cover by its public path. Anything else, or a missing file, is ignored. */
export async function deleteCover(publicPath: string | null): Promise<void> {
  const filename = publicPath?.startsWith("/covers/") ? publicPath.slice("/covers/".length) : null;
  if (!filename || !COVER_FILENAME.test(filename)) return;
  try {
    await rm(coverPath(filename));
  } catch {
    // Already gone. Either way there is nothing to clean up.
  }
}
