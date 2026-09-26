import type { EditableWork } from "./edit-fields";

/** Only what the form shows: a work row also carries Open Library's whole payload. */
export function workFields(work: EditableWork): EditableWork {
  return {
    title: work.title,
    subtitle: work.subtitle,
    authors: work.authors,
    authorSort: work.authorSort,
    firstPublishedYear: work.firstPublishedYear,
    summary: work.summary,
  };
}
