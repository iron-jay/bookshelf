"use client";

import { useActionState } from "react";

import Link from "next/link";

import { languageOptions } from "@/lib/languages";

/**
 * The edit page's pieces (§5): a book's fields, an edition's, and the form
 * around them. /work/[slug]/edit uses the first; /edition/[id]/edit both,
 * saved together, since "the title is in Japanese" is a fix to the book and
 * the edition's name at once.
 */

export type EditState = { error: string | null };

const FIELD = "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";
const BUTTON = "border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim";

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-narrow text-ink-dim">{label}</span>
      {children}
    </label>
  );
}

/**
 * Saves and, on success, the action redirects back to the book; an error
 * stays here beside the fields, with what was typed kept.
 */
export function EditForm({
  action,
  hidden,
  backHref,
  children,
}: {
  action: (state: EditState, formData: FormData) => Promise<EditState>;
  hidden: Record<string, string>;
  backHref: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8 font-narrow">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href={backHref} className="text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
        {state.error ? (
          <p role="alert" className="border-l-2 border-ink-dim pl-3">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export type EditableWork = {
  title: string;
  subtitle: string | null;
  authors: string[];
  authorSort: string | null;
  firstPublishedYear: number | null;
  summary: string | null;
};

export function WorkFields({ work, heading }: { work: EditableWork; heading: string | null }) {
  return (
    <fieldset className="flex flex-col gap-3">
      {heading ? <legend className="mb-3 text-base font-medium">{heading}</legend> : null}
      <Field label="Title">
        <input name="title" required maxLength={500} defaultValue={work.title} className={FIELD} />
      </Field>
      <Field label="Subtitle">
        <input name="subtitle" maxLength={500} defaultValue={work.subtitle ?? ""} className={FIELD} />
      </Field>
      <Field label="Author, or authors separated by commas">
        <input name="authors" maxLength={2000} defaultValue={work.authors.join(", ")} className={FIELD} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Sorted under (blank to work it out)" className="min-w-64 flex-1">
          <input name="authorSort" maxLength={200} defaultValue={work.authorSort ?? ""} placeholder="Pratchett, Terry" className={FIELD} />
        </Field>
        <Field label="First published" className="w-32">
          <input name="year" inputMode="numeric" defaultValue={work.firstPublishedYear ?? ""} placeholder="1989" className={FIELD} />
        </Field>
      </div>
      <Field label="Summary">
        <textarea
          name="summary"
          rows={6}
          maxLength={20_000}
          defaultValue={work.summary ?? ""}
          className={`${FIELD} font-serif text-lg leading-relaxed`}
        />
      </Field>
    </fieldset>
  );
}

const KINDS: { value: string; label: string }[] = [
  { value: "original", label: "Edition" },
  { value: "translation", label: "Official translation" },
  { value: "fan_translation", label: "Fan translation" },
  { value: "revised", label: "Revised text" },
  { value: "abridged", label: "Abridged" },
  { value: "annotated", label: "Annotated" },
  { value: "other", label: "Other" },
];

export type EditableEdition = {
  name: string;
  kind: string;
  credit: string | null;
  language: string | null;
  publisher: string | null;
  publishedOn: string | null;
  pages: number | null;
  durationMinutes: number | null;
  isbn13: string | null;
  url: string | null;
  notes: string | null;
  baseEditionId: string | null;
};

export function EditionFields({
  edition,
  otherEditions,
  heading,
}: {
  edition: EditableEdition;
  /** Candidates for the base: the work's other editions. */
  otherEditions: { id: string; name: string }[];
  heading: string;
}) {
  const hours = edition.durationMinutes ? Math.floor(edition.durationMinutes / 60) : null;
  const minutes = edition.durationMinutes ? edition.durationMinutes % 60 : null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-base font-medium">{heading}</legend>
      <div className="flex flex-wrap gap-3">
        <Field label="Name" className="min-w-64 flex-[2]">
          <input name="name" required maxLength={200} defaultValue={edition.name} className={FIELD} />
        </Field>
        <Field label="Kind" className="flex-1">
          <select name="kind" defaultValue={edition.kind} className={FIELD}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Credit (translator, or reader for an audiobook)" className="min-w-64 flex-[2]">
          <input name="credit" maxLength={200} defaultValue={edition.credit ?? ""} className={FIELD} />
        </Field>
        <Field label="Language" className="flex-1">
          <select name="language" defaultValue={edition.language ?? ""} className={FIELD}>
            <option value="">Not specified</option>
            {languageOptions(edition.language).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Publisher" className="min-w-64 flex-[2]">
          <input name="publisher" maxLength={200} defaultValue={edition.publisher ?? ""} className={FIELD} />
        </Field>
        <Field label="Published" className="flex-1">
          <input name="publishedOn" type="date" defaultValue={edition.publishedOn ?? ""} className={FIELD} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Pages" className="w-28">
          <input name="pages" inputMode="numeric" defaultValue={edition.pages ?? ""} className={FIELD} />
        </Field>
        <Field label="Length, hours" className="w-28">
          <input name="hours" inputMode="numeric" defaultValue={hours ?? ""} className={FIELD} />
        </Field>
        <Field label="minutes" className="w-24">
          <input name="minutes" inputMode="numeric" defaultValue={minutes ?? ""} className={FIELD} />
        </Field>
        <Field label="ISBN" className="min-w-48 flex-1">
          <input name="isbn" maxLength={30} defaultValue={edition.isbn13 ?? ""} className={`${FIELD} font-mono`} />
        </Field>
      </div>
      {otherEditions.length > 0 ? (
        <Field label="Translated from or based on">
          <select name="baseEditionId" defaultValue={edition.baseEditionId ?? ""} className={FIELD}>
            <option value="">Not specified</option>
            {otherEditions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Link">
        <input name="url" type="url" maxLength={2000} defaultValue={edition.url ?? ""} className={FIELD} />
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={3} maxLength={5000} defaultValue={edition.notes ?? ""} className={FIELD} />
      </Field>
    </fieldset>
  );
}
