/**
 * A candidate source work for a fan translation, as the inline search returns
 * it. In its own module because a "use server" file may export only async
 * functions — a type is erased, but keeping shared shapes out of that file
 * means nobody is tempted to add a constant beside it.
 */
export type SourceEdition = { id: string; name: string; language: string | null };

export type SourceResult =
  | {
      kind: "local";
      workId: string;
      title: string;
      authors: string[];
      year: number | null;
      /** Candidates for the base edition: the text being translated. */
      editions: SourceEdition[];
    }
  | {
      kind: "openlibrary";
      olWorkKey: string;
      title: string;
      authors: string[];
      year: number | null;
    };
