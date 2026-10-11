/**
 * What an Open Library edition is called on this server: "Paperback, 1990",
 * "Audio CD, 2005". Open Library editions have no name of their own. The
 * publisher is not part of it (Jay, 2026-10-11: not wanted anywhere on
 * screen); it is still stored, and exported.
 *
 * With no format it is plain "Book" or "Audiobook" — the same name "any
 * edition" gets — plus the year when there is one.
 */
export function editionNameFor(
  edition: { physicalFormat: string | null; year: number | null },
  format: "book" | "audiobook",
): string {
  // "paperback" → "Paperback", but "eAudiobook" and "CD-ROM" are left as
  // written: any capital means someone chose the casing.
  const raw = edition.physicalFormat;
  const physical =
    raw && raw === raw.toLowerCase() ? raw[0].toUpperCase() + raw.slice(1) : raw;
  return [physical || plainEditionName(format), edition.year].filter((part) => part !== null).join(", ");
}

export function plainEditionName(format: "book" | "audiobook"): string {
  return format === "audiobook" ? "Audiobook" : "Book";
}
