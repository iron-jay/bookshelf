"use client";

import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * "Finished it" on the shelves, asking for a rating on the way: the moment you
 * close a book is when you know what you thought of it. Nothing is written
 * until the prompt is answered, so "Not yet" really is not yet, and skipping
 * the rating still finishes the book.
 */
export function FinishPrompt({
  action,
  fields,
  title,
  rating,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Hidden inputs the action needs: which edition, and which shelf. */
  fields: Record<string, string>;
  title: string;
  rating: number | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  // The dialog takes focus itself rather than handing it to the first bar,
  // which would read as a rating of one before anything was chosen.
  const open = () => {
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={open}>
        Finished it
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        tabIndex={-1}
        className="m-auto w-[min(100%-2rem,26rem)] border outline-none border-line bg-band p-6 text-ink backdrop:bg-plank-shadow/80"
      >
        <form
          action={async (formData) => {
            await action(formData);
            dialog.current?.close();
          }}
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <h2 id={headingId} className="font-serif text-2xl leading-tight font-semibold">
            Finished {title}
          </h2>
          <p className="mt-1 mb-4 font-narrow text-ink-dim">How was it, out of ten?</p>
          <RatingAnswers rating={rating} onCancel={() => dialog.current?.close()} />
        </form>
      </dialog>
    </>
  );
}

/** The ten bars and the two ways out, inside a form whose action finishes the book. */
export function RatingAnswers({ rating, onCancel }: { rating: number | null; onCancel: () => void }) {
  const { pending } = useFormStatus();
  // The bars fill up to whichever one is under the pointer, so you see the
  // rating before you press it.
  const [pointing, setPointing] = useState<number | null>(null);
  const shown = pointing ?? rating ?? 0;

  return (
    <>
      <div className="flex items-end gap-1" onMouseLeave={() => setPointing(null)}>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="submit"
            name="rating"
            value={value}
            disabled={pending}
            aria-label={`Rate ${value} out of 10`}
            title={`${value} / 10`}
            onMouseEnter={() => setPointing(value)}
            onFocus={() => setPointing(value)}
            onBlur={() => setPointing(null)}
            className={`flex-1 ${value <= shown ? "bg-accent" : "bg-line"}`}
            style={{ height: `${18 + value * 4}px` }}
          />
        ))}
      </div>
      <p className="mt-2 h-5 font-mono text-sm text-accent">{shown ? `${shown} / 10` : ""}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {/* No rating in this submit, so a rating given while reading stays. */}
        <button type="submit" disabled={pending} className="btn btn-sm">
          {rating ? `Keep ${rating} / 10` : "Skip the rating"}
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className="btn btn-sm">
          Not yet
        </button>
      </div>
    </>
  );
}
