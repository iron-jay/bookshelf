/**
 * Open Library's raw shapes, as far as bookshelf reads them. Every field is
 * optional because every field is sometimes missing: the data is community
 * edited, and nothing upstream enforces a schema. Normalise in normalise.ts;
 * nothing outside lib/openlibrary should see these.
 */

type Key = { key: string };

/** Descriptions come either as a bare string or wrapped in {type, value}. */
export type OlText = string | { type?: string; value?: string };

export type OlSearchDoc = {
  key?: string; // "/works/OL453735W"
  title?: string;
  subtitle?: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
};

export type OlSearchResponse = {
  numFound?: number;
  docs?: OlSearchDoc[];
};

export type OlEdition = {
  key?: string; // "/books/OL7814892M"
  title?: string;
  subtitle?: string;
  works?: Key[];
  authors?: Key[];
  publishers?: string[];
  publish_date?: string; // free text: "1991", "March 1991", "Mar 12, 1991"
  physical_format?: string;
  number_of_pages?: number;
  covers?: number[];
  languages?: Key[]; // "/languages/eng"
  isbn_10?: string[];
  isbn_13?: string[];
  /** Narrators live here on audiobook records: role "Narrator/Reader". */
  contributors?: { role?: string; name?: string }[];
};

export type OlEditionsResponse = {
  size?: number;
  entries?: OlEdition[];
};

export type OlWork = {
  key?: string;
  title?: string;
  subtitle?: string;
  description?: OlText;
  covers?: number[];
  authors?: { author?: Key }[];
};

