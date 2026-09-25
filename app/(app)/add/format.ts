/**
 * The Book | Audiobook toggle defaults to whichever was picked last (brief §5).
 * A cookie rather than a user column: it is a convenience of this browser, and
 * the server needs it at render time so the form never flashes the wrong one.
 */
export const FORMAT_COOKIE = "bookshelf_format";

export type Format = "book" | "audiobook";

export function isFormat(value: unknown): value is Format {
  return value === "book" || value === "audiobook";
}
