"use client";

import { useActionState, useState } from "react";

import { addBook, type AddState } from "./actions";
import { CreditField, LengthField } from "./credit-fields";
import { EditionPicker, type PickerEdition } from "./edition-picker";
import { FormatToggle } from "./format-toggle";
import type { Format } from "./format";
import { ShelfPicker } from "./shelf-picker";

const INITIAL: AddState = { error: null };

/**
 * The Book path of the add flow: format, edition, shelf.
 */
export function AddForm({
  olWorkKey,
  workTitle,
  isbn,
  editions,
  defaultFormat,
  defaultEdition,
}: {
  olWorkKey: string;
  workTitle: string;
  isbn: string | null;
  editions: PickerEdition[];
  defaultFormat: Format;
  defaultEdition: string;
}) {
  const [state, action, pending] = useActionState(addBook, INITIAL);
  const [format, setFormat] = useState<Format>(defaultFormat);
  const [edition, setEdition] = useState(defaultEdition);
  const [credit, setCredit] = useState(
    () => editions.find((e) => e.key === defaultEdition)?.narrators.join(", ") ?? "",
  );
  const [creditTouched, setCreditTouched] = useState(false);

  function changeFormat(next: Format) {
    setFormat(next);
    // The list is per format, so a chosen edition of the other kind would be
    // selected but invisible. Back to "any edition" rather than submit it.
    if (editions.find((e) => e.key === edition)?.format !== next) setEdition("");
  }

  function changeEdition(next: string) {
    setEdition(next);
    // Open Library knows the narrators of some audiobook records. Offered as a
    // prefill until the field is typed in, and never over what was typed.
    if (!creditTouched) {
      setCredit(editions.find((e) => e.key === next)?.narrators.join(", ") ?? "");
    }
  }

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="olWorkKey" value={olWorkKey} />
      {isbn ? <input type="hidden" name="isbn" value={isbn} /> : null}

      <FormatToggle value={format} onChange={changeFormat} />

      {format === "audiobook" ? (
        <div className="flex flex-wrap gap-4">
          <CreditField
            label="Read by"
            value={credit}
            onChange={(value) => {
              setCredit(value);
              setCreditTouched(true);
            }}
          />
          <LengthField />
        </div>
      ) : null}

      <EditionPicker
        editions={editions}
        format={format}
        workTitle={workTitle}
        selected={edition}
        onSelect={changeEdition}
      />

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
