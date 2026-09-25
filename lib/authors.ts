/**
 * Particles that belong with the surname, in either case: "Le Guin",
 * "de Beauvoir", "van Gogh", "del Toro". The first word is never taken as one,
 * so "Del Shannon" keeps his given name.
 */
const PARTICLES = new Set(["da", "de", "del", "della", "der", "di", "du", "la", "le", "van", "von"]);

/** Generational suffixes stay attached to the name they follow. */
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

/**
 * "Terry Pratchett" → "Pratchett, Terry", "Ursula K. Le Guin" → "Le Guin,
 * Ursula K.". Used only to order and group a shelf by author, never shown as
 * the name.
 *
 * This is a convention, not a fact about the person. It is wrong for
 * family-name-first names ("Murakami Haruki" as written in Japanese order) and
 * for single handles ("someone_on_ao3", which is fine: it sorts as itself).
 * Editable once the work page lands.
 */
export function authorSortFor(name: string | undefined): string | null {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return null;
  if (words.length === 1) return words[0];

  let suffix = "";
  if (words.length > 2 && SUFFIX.test(words[words.length - 1])) {
    suffix = ` ${words.pop()}`;
  }

  let start = words.length - 1;
  while (start > 1 && PARTICLES.has(words[start - 1].toLowerCase())) start--;

  const surname = words.slice(start).join(" ");
  const given = words.slice(0, start).join(" ");
  return `${surname}, ${given}${suffix}`;
}
