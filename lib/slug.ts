/**
 * Shared by works, series and tags.
 *
 * Letters and digits in any script survive. gameshelf's version kept only a–z,
 * which turns "Белая гвардия" or a light novel's Japanese title into
 * "untitled" — rare for games, routine for books. Latin accents are still
 * folded ("Les Misérables" → "les-miserables"), because that is what people
 * type.
 */
export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      // Latin accents only. Stripping every combining mark would take the
      // voicing off Japanese kana — だ decomposes to た plus a mark — and turn
      // one word into another. NFC then puts the kana back together.
      .replace(/[\u0300-\u036f]/g, "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/[\s-]+/g, "-")
      .slice(0, 80)
      .replace(/-+$/, "") || "untitled"
  );
}
