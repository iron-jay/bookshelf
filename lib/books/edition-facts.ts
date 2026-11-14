import { languageName } from "@/lib/languages";

/** What an edition's kind is called on screen; an original or "other" goes unsaid. */
export const KIND_LABELS: Readonly<Record<string, string | null>> = {
  original: null,
  translation: "Official translation",
  revised: "Revised text",
  abridged: "Abridged",
  annotated: "Annotated",
  other: null,
};

export function lengthLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : null, m ? `${m} min` : null].filter(Boolean).join(" ");
}

/** The label the credit gets depends on what the edition is (schema comment). */
export function creditLabel(kind: string, format: string): string {
  if (kind === "translation") return "Translated by";
  return format === "audiobook" ? "Read by" : "Credit";
}

/**
 * One line of an edition's facts. `mono` is set in Plex Mono (codes); a fact
 * that opens something carries where: another edition, or an address.
 */
export type EditionFact = { label: string; text: string; mono?: boolean; editionId?: string; href?: string };

type FactsOf = {
  kind: string;
  format: string;
  credit: string | null;
  language: string | null;
  publishedOn: string | null;
  pages: number | null;
  durationMinutes: number | null;
  isbn13: string | null;
  olEditionKey: string | null;
  goodreadsBookId: number | string | null;
  url: string | null;
};

/**
 * The few facts about an edition worth knowing, in the order the edition
 * page lists them, leaving out what is empty. The web page and the phone
 * (GET /editions/{id}) show the same list.
 */
export function editionFacts(edition: FactsOf, base: { id: string; name: string } | null): EditionFact[] {
  const facts: (EditionFact | null)[] = [
    KIND_LABELS[edition.kind] ? { label: "Kind", text: KIND_LABELS[edition.kind]! } : null,
    edition.credit ? { label: creditLabel(edition.kind, edition.format), text: edition.credit } : null,
    base ? { label: "Translated from", text: base.name, editionId: base.id } : null,
    languageName(edition.language) ? { label: "Language", text: languageName(edition.language)! } : null,
    edition.publishedOn ? { label: "Published", text: edition.publishedOn } : null,
    edition.pages ? { label: "Pages", text: String(edition.pages) } : null,
    lengthLabel(edition.durationMinutes) ? { label: "Length", text: lengthLabel(edition.durationMinutes)! } : null,
    edition.isbn13 ? { label: "ISBN", text: edition.isbn13, mono: true } : null,
    edition.olEditionKey ? { label: "Open Library", text: edition.olEditionKey, mono: true } : null,
    // For books no catalogue has: the Goodreads page the import came from is
    // one click away, to copy its cover address into "paste an address".
    // Opened in the person's own browser — nothing here fetches Goodreads.
    edition.goodreadsBookId
      ? { label: "Goodreads", text: "View on Goodreads", href: `https://www.goodreads.com/book/show/${edition.goodreadsBookId}` }
      : null,
    edition.url ? { label: "Link", text: edition.url, href: edition.url } : null,
  ];
  return facts.filter((fact): fact is EditionFact => fact !== null);
}
