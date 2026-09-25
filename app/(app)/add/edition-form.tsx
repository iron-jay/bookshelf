"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import { addEditionAction, type AddState } from "./actions";
import { CreditField, creditLabelFor, LengthField } from "./credit-fields";
import { FormatToggle } from "./format-toggle";
import type { Format } from "./format";
import { ShelfPicker } from "./shelf-picker";
import { SourcePicker, WorkFields, type SourceChoice } from "./source-picker";
import type { SourceEdition } from "./source-types";

const INITIAL: AddState = { error: null };
const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";
const BUTTON =
  "w-fit border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim";

export type FixedWork = {
  id: string;
  title: string;
  authors: string[];
  olWorkKey: string | null;
  editions: SourceEdition[];
};

export type DoorAType = "book" | "fan_translation";

/** Door B's kinds. fanfic, podfic and fan_edit were dropped (migration 0001). */
const KINDS: { value: string; label: string }[] = [
  { value: "original", label: "Edition" },
  { value: "translation", label: "Official translation" },
  { value: "fan_translation", label: "Fan translation" },
  { value: "revised", label: "Revised text" },
  { value: "abridged", label: "Abridged" },
  { value: "annotated", label: "Annotated" },
  { value: "other", label: "Other" },
];

/** Codes, not names, go in the column; the names are for the picker only. */
const LANGUAGE_CODES = [
  "en", "ja", "zh", "ko", "es", "fr", "de", "it", "pt", "ru", "pl", "nl", "sv",
  "da", "no", "fi", "cs", "hu", "el", "tr", "uk", "ar", "he", "hi", "id", "th", "vi",
];

function languageOptions(): { code: string; name: string }[] {
  const names = new Intl.DisplayNames("en", { type: "language" });
  return LANGUAGE_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * The one form for editions typed in by hand (brief §5). Door A arrives with
 * no work and a Book | Fan translation choice; Door B arrives from a work page
 * with the work fixed and asks what kind of edition to add. Same component,
 * same action, same fields — Door B is Door A with the work pre-filled.
 *
 * Door A's Book is mostly a way into search, because a book Open Library has
 * is better added from Open Library. "Create it manually" is the way out for
 * the rest, and turns this into the same form with title and author fields.
 */
export function EditionForm({
  fixedWork,
  initialType = "book",
  initialManual = false,
  initialTitle = "",
  defaultFormat,
}: {
  fixedWork: FixedWork | null;
  initialType?: DoorAType;
  initialManual?: boolean;
  initialTitle?: string;
  defaultFormat: Format;
}) {
  const [state, action, pending] = useActionState(addEditionAction, INITIAL);
  const [type, setType] = useState<DoorAType>(initialType);
  const [manual, setManual] = useState(initialManual);
  const [doorBKind, setDoorBKind] = useState("original");
  const [format, setFormat] = useState<Format>(defaultFormat);
  const [credit, setCredit] = useState("");
  const [source, setSource] = useState<SourceChoice | null>(null);

  const kind = fixedWork ? doorBKind : type === "fan_translation" ? "fan_translation" : "original";
  const translation = kind === "fan_translation" || kind === "translation";
  const creditLabel = creditLabelFor(kind, format);

  // Candidates for the base edition: the fixed work's, or the chosen source's
  // when it is already here. A work not cached yet has none to offer.
  const baseOptions = fixedWork?.editions ?? (source?.kind === "local" ? source.editions : []);

  const doorA = !fixedWork;
  const searching = doorA && type === "book" && !manual;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {doorA ? (
        <div className="flex gap-5 font-narrow" role="tablist">
          {(
            [
              ["book", "Book"],
              ["fan_translation", "Fan translation"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={type === value}
              onClick={() => setType(value)}
              className={type === value ? "font-medium" : "text-ink-dim hover:text-ink"}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {searching ? (
        // Its own form, outside the add form: forms do not nest.
        <div className="flex flex-col gap-3">
          <form action="/search" className="flex gap-2">
            <input
              name="q"
              type="search"
              placeholder="Title, author or ISBN"
              aria-label="Search Open Library"
              defaultValue={initialTitle}
              className={`${FIELD} max-w-md`}
            />
            <button type="submit" className={BUTTON}>
              Search
            </button>
          </form>
          <p className="font-narrow text-ink-dim">
            Not on Open Library — a zine, an ARC, something out of print?{" "}
            <button type="button" onClick={() => setManual(true)} className="underline hover:text-ink">
              Create it manually
            </button>
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-6">
          <input type="hidden" name="kind" value={kind} />
          {fixedWork ? <input type="hidden" name="workId" value={fixedWork.id} /> : null}

          {fixedWork ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-narrow text-ink-dim">Kind</span>
                <select
                  value={doorBKind}
                  onChange={(event) => setDoorBKind(event.target.value)}
                  className="w-fit border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              {fixedWork.olWorkKey && doorBKind === "original" ? (
                <p className="font-narrow text-ink-dim">
                  A published edition is usually on Open Library already —{" "}
                  <Link href={`/add/book/${fixedWork.olWorkKey}`} className="underline hover:text-ink">
                    pick it from their list
                  </Link>{" "}
                  instead of typing it in.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Fan translation: name first, then source, then details (§5). */}
          {kind === "fan_translation" || fixedWork ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-narrow text-ink-dim">
                {kind === "fan_translation" ? "Name" : "Name (optional)"}
              </span>
              <input
                name="name"
                required={kind === "fan_translation"}
                maxLength={200}
                placeholder={
                  kind === "fan_translation" ? "Web novel (fan TL)" : format === "audiobook" ? "Audiobook" : "Book"
                }
                className={`${FIELD} max-w-md`}
              />
            </label>
          ) : null}

          {doorA && type === "fan_translation" ? (
            <SourcePicker choice={source} onChoose={setSource} />
          ) : null}

          {doorA && type === "book" && manual ? (
            <div className="flex flex-col gap-2">
              <WorkFields defaultTitle={initialTitle} />
              <button
                type="button"
                onClick={() => setManual(false)}
                className="w-fit font-narrow text-ink-dim underline hover:text-ink"
              >
                Search Open Library instead
              </button>
            </div>
          ) : null}

          <FormatToggle value={format} onChange={setFormat} />

          {creditLabel || format === "audiobook" ? (
            <div className="flex flex-wrap gap-4">
              {creditLabel ? <CreditField label={creditLabel} value={credit} onChange={setCredit} /> : null}
              {format === "audiobook" ? <LengthField /> : null}
            </div>
          ) : null}

          {translation || fixedWork ? (
            <div className="flex flex-wrap gap-4">
              {baseOptions.length > 0 ? (
                <label className="flex min-w-64 flex-1 flex-col gap-1.5">
                  <span className="font-narrow text-ink-dim">
                    {translation ? "Translated from (optional)" : "Based on (optional)"}
                  </span>
                  <select name="baseEditionId" defaultValue="" className={FIELD}>
                    <option value="">Not specified</option>
                    {baseOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.language ? ` · ${e.language}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5">
                <span className="font-narrow text-ink-dim">Language</span>
                <select name="language" defaultValue={translation ? "en" : ""} className={FIELD}>
                  <option value="">Not specified</option>
                  {languageOptions().map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {translation || fixedWork ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="font-narrow text-ink-dim">Link (optional)</span>
                <input name="url" type="url" maxLength={2000} placeholder="https://" className={`${FIELD} max-w-xl`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-narrow text-ink-dim">Notes (optional)</span>
                <textarea name="notes" rows={3} maxLength={5000} className={`${FIELD} max-w-xl`} />
              </label>
            </>
          ) : null}

          <ShelfPicker />

          {state.error ? (
            <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || (doorA && type === "fan_translation" && !source)}
            className={BUTTON}
          >
            {pending ? "Adding…" : "Add to shelf"}
          </button>
        </form>
      )}
    </div>
  );
}
