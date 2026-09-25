"use client";

import { useActionState } from "react";

import { saveWork, type WorkState } from "./actions";

const INITIAL: WorkState = { error: null, saved: false };
const FIELD = "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

export type EditableWork = {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  authorSort: string | null;
  firstPublishedYear: number | null;
  summary: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-narrow text-ink-dim">{label}</span>
      {children}
    </label>
  );
}

/** Closed until asked for: the page is for reading about the book. */
export function WorkEditForm({ work }: { work: EditableWork }) {
  const [state, action, pending] = useActionState(saveWork, INITIAL);

  return (
    <details className="font-narrow">
      <summary className="cursor-pointer text-ink-dim hover:text-ink">Edit details</summary>
      <form action={action} className="mt-3 flex max-w-2xl flex-col gap-3">
        <input type="hidden" name="workId" value={work.id} />
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
          <div className="min-w-64 flex-1">
            <Field label="Sorted under (blank to work it out)">
              <input name="authorSort" maxLength={200} defaultValue={work.authorSort ?? ""} placeholder="Pratchett, Terry" className={FIELD} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="First published">
              <input name="year" inputMode="numeric" defaultValue={work.firstPublishedYear ?? ""} placeholder="1989" className={FIELD} />
            </Field>
          </div>
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
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="border border-line bg-panel px-3 py-2 hover:border-ink-dim disabled:text-ink-dim"
          >
            {pending ? "Saving…" : "Save details"}
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
