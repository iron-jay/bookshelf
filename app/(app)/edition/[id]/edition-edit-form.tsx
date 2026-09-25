"use client";

import { useActionState } from "react";

import { languageOptions } from "@/lib/languages";

import { saveEdition, type FormState } from "./actions";

const INITIAL: FormState = { error: null, saved: false };
const FIELD = "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

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
  id: string;
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

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-narrow text-ink-dim">{label}</span>
      {children}
    </label>
  );
}

/**
 * Everything about the edition except its format, which has its own toggle
 * above. Closed until asked for.
 */
export function EditionEditForm({
  edition,
  otherEditions,
}: {
  edition: EditableEdition;
  /** Candidates for the base: the work's other editions. */
  otherEditions: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveEdition, INITIAL);
  const hours = edition.durationMinutes ? Math.floor(edition.durationMinutes / 60) : null;
  const minutes = edition.durationMinutes ? edition.durationMinutes % 60 : null;

  return (
    <details className="font-narrow">
      <summary className="cursor-pointer text-ink-dim hover:text-ink">Edit edition details</summary>
      <form action={action} className="mt-3 flex max-w-2xl flex-col gap-3">
        <input type="hidden" name="editionId" value={edition.id} />
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
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="border border-line bg-panel px-3 py-2 hover:border-ink-dim disabled:text-ink-dim">
            {pending ? "Saving…" : "Save edition"}
          </button>
          {state.error ? (
            <p role="alert" className="border-l-2 border-ink-dim pl-3">
              {state.error}
            </p>
          ) : state.saved ? (
            <p role="status" className="text-ink-dim">
              Saved
            </p>
          ) : null}
        </div>
      </form>
    </details>
  );
}
