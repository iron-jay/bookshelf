/**
 * ISBN parsing, shared by search (a typed or pasted ISBN goes straight to the
 * edition) and, later, the Goodreads import.
 *
 * Checksums are verified rather than trusting the shape: thirteen digits is
 * also a phone number, a barcode, or a typo, and a typo that happens to be
 * well-formed would otherwise send someone to a stranger's book.
 */

export type Isbn = { isbn13: string; isbn10: string | null };

export type IsbnParse =
  | { kind: "isbn"; isbn: Isbn }
  /** Shaped like an ISBN but the check digit is wrong — almost always a typo. */
  | { kind: "bad-checksum"; digits: string }
  | { kind: "not-isbn" };

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

/** Every ISBN-10 has an ISBN-13; only 978-prefixed ISBN-13s have an ISBN-10. */
function toIsbn10(isbn13: string): string | null {
  if (!isbn13.startsWith("978")) return null;
  const first9 = isbn13.slice(3, 12);
  return first9 + isbn10CheckDigit(first9);
}

/**
 * Accepts what people actually paste: "978-0-552-13462-0", "0 552 13462 7",
 * "ISBN: 9780552134620", "ISBN-10 055213462x".
 */
export function parseIsbn(input: string): IsbnParse {
  const digits = input
    .trim()
    .replace(/^isbn(?:-1[03])?\s*:?\s*/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();

  if (/^97[89]\d{10}$/.test(digits)) {
    if (isbn13CheckDigit(digits.slice(0, 12)) !== digits[12]) {
      return { kind: "bad-checksum", digits };
    }
    return { kind: "isbn", isbn: { isbn13: digits, isbn10: toIsbn10(digits) } };
  }

  if (/^\d{9}[\dX]$/.test(digits)) {
    if (isbn10CheckDigit(digits.slice(0, 9)) !== digits[9]) {
      return { kind: "bad-checksum", digits };
    }
    const first12 = "978" + digits.slice(0, 9);
    return {
      kind: "isbn",
      isbn: { isbn13: first12 + isbn13CheckDigit(first12), isbn10: digits },
    };
  }

  return { kind: "not-isbn" };
}
