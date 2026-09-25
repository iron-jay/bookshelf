"use client";

import { useActionState, useState } from "react";

import { addBook, type AddState } from "./actions";
import { AudiobookFields } from "./audiobook-fields";
import { EditionPicker, type PickerEdition } from "./edition-picker";
import { FormatToggle } from "./format-toggle";
import type { Format } from "./format";
import { ShelfPicker } from "./shelf-picker";

const INITIAL: AddState = { error: null };

/**
 * The Book path of the add flow: format, edition, shelf. Fan translations and
 * manually created works join this form in build step 6 rather than getting
 * forms of their own — the brief's one rule about adding is that there is one
 * add flow.
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
        <AudiobookFields
          credit={credit}
          onCreditChange={(value) => {
            setCredit(value);
            setCreditTouched(true);
          }}
        />
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
        className="w-fit border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Adding…" : "Add to shelf"}
      </button>
    </form>
  );
}
