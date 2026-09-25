/**
 * Raw Open Library fields in, bookshelf's shapes out. When a field is missing
 * or unusable the result is null — never a guess (brief §4).
 */

/** "/works/OL453735W" → "OL453735W". The bare key is what the schema stores. */
export function bareKey(path: string | undefined): string | null {
  const key = path?.split("/").pop();
  return key ? key : null;
}

/**
 * Open Library marks "no cover" as -1 in some records and omits it in others.
 * Either way the answer is no cover id.
 */
export function coverId(id: number | undefined): number | null {
  return id && id > 0 ? id : null;
}

export function coverUrl(id: number, size: "S" | "M" | "L"): string {
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
}

/**
 * The brief's rule for the edition picker: "audio" anywhere in
 * physical_format ("Audio CD", "Audiobook", "audio cassette") is an audiobook,
 * and everything else — including no format at all — is a book. That last part
 * is the rule, not a guess: `format` is never null, and a missing
 * physical_format is overwhelmingly a print record nobody filled in.
 */
export function formatOf(physicalFormat: string | undefined): "book" | "audiobook" {
  return physicalFormat?.toLowerCase().includes("audio") ? "audiobook" : "book";
}

/**
 * "/languages/ger" → "de". Open Library uses MARC codes, which are mostly
 * ISO 639-2/B; Intl already knows their two-letter equivalents, so no table
 * lives here. "mul" (multiple) and "und" (undetermined) say nothing about any
 * one language and come back as null.
 */
export function languageOf(path: string | undefined): string | null {
  const code = bareKey(path);
  if (!code || code === "mul" || code === "und") return null;
  try {
    return Intl.getCanonicalLocales(code)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * publish_date is free text: "1991", "March 1991", "Mar 12, 1991", "c1991",
 * sometimes nonsense. The year is the part that is reliably there.
 */
export function yearOf(publishDate: string | undefined): number | null {
  const match = publishDate?.match(/(?<!\d)(1[4-9]\d{2}|20\d{2})(?!\d)/);
  return match ? Number(match[1]) : null;
}

/** Trimmed text, with blank treated as missing. */
export function textOf(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
