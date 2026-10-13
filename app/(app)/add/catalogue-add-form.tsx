"use client";

import { useActionState, useState } from "react";

import type { AddState } from "./actions";
import type { Format } from "./format";
import { FormatToggle } from "./format-toggle";
import { ShelfPicker } from "./shelf-picker";

const INITIAL: AddState = { error: null };

/**
 * The add form for a book from Hardcover or Comic Vine: which shelf, and for
 * a book, Book or Audiobook. The book itself is named by hidden fields, and
 * whatever else the page needs to ask (which issue) comes in as children.
 */
export function CatalogueAddForm({
  action,
  hidden,
  withFormat,
  defaultFormat,
  children,
}: {
  action: (state: AddState, formData: FormData) => Promise<AddState>;
  hidden: Record<string, string>;
  withFormat: boolean;
  defaultFormat: Format;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [format, setFormat] = useState<Format>(defaultFormat);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {withFormat ? <FormatToggle value={format} onChange={setFormat} /> : <input type="hidden" name="format" value="book" />}
      <ShelfPicker />
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit btn btn-primary"
      >
        {pending ? "Adding…" : "Add to shelf"}
      </button>
    </form>
  );
}
