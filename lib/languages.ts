/** "de" → "German". A code Intl does not know is shown as itself. */
export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames("en", { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The languages offered in pickers. Codes go in the column (ISO 639, as Open
 * Library's become through Intl); names are for people. A code already on a
 * row but not in this list is still offered, so editing never loses it.
 */
const COMMON = [
  "en", "ja", "zh", "ko", "es", "fr", "de", "it", "pt", "ru", "pl", "nl", "sv",
  "da", "no", "fi", "cs", "hu", "el", "tr", "uk", "ar", "he", "hi", "id", "th", "vi",
];

export function languageOptions(current?: string | null): { code: string; name: string }[] {
  const codes = current && !COMMON.includes(current) ? [...COMMON, current] : COMMON;
  return codes
    .map((code) => ({ code, name: languageName(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
