/**
 * What an Open Library edition is called on this server: "Paperback, Corgi
 * Books 1990", "Audio CD, Random House 2005". Open Library editions have no
 * name of their own, and the brief's example is built this way.
 *
 * Everything missing is left out rather than filled in. With nothing at all to
 * go on it is plain "Book" or "Audiobook" — the same name "any edition" gets.
 */
export function editionNameFor(
  edition: { physicalFormat: string | null; publisher: string | null; year: number | null },
  format: "book" | "audiobook",
): string {
  // "paperback" → "Paperback", but "eAudiobook" and "CD-ROM" are left as
  // written: any capital means someone chose the casing.
  const raw = edition.physicalFormat;
  const physical =
    raw && raw === raw.toLowerCase() ? raw[0].toUpperCase() + raw.slice(1) : raw;
  const imprint = [edition.publisher, edition.year].filter((part) => part !== null).join(" ");

  const name = [physical, imprint].filter(Boolean).join(", ");
  return name || plainEditionName(format);
}

export function plainEditionName(format: "book" | "audiobook"): string {
  return format === "audiobook" ? "Audiobook" : "Book";
}
