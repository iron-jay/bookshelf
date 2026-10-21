"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { SHELF_LABELS, SHELVES } from "@/lib/shelves";

import { Cover } from "./cover";
import { setShelf } from "./edition/[id]/actions";
import { RatingAnswers } from "./finish-prompt";
import { authorLine, type ShelfCard } from "./shelf-card";

/**
 * A cover on the main page opens this rather than the book (Jay, 2026-10-21):
 * moving to read to reading, or reading to did not finish, was a trip to the
 * edition page and back. The book's page is one press further, under Open.
 * Finished goes by way of the rating, as Finished it does in the band; the
 * reads follow the shelf exactly as they do on the book's page.
 */
export function QuickShelf({
  card,
  className,
  children,
}: {
  card: ShelfCard;
  className: string;
  /** What the opener shows: nothing but a title on a tile, the cover in the band. */
  children: ReactNode;
}) {
  const title = card.workTitle;
  const subtitle = [authorLine(card.authors), card.format === "audiobook" ? "Audiobook" : null]
    .filter(Boolean)
    .join(" · ");
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [finishing, setFinishing] = useState(false);

  const open = () => {
    setFinishing(false);
    dialog.current?.showModal();
    dialog.current?.focus();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={open} className={className}>
        {children}
      </button>
      {/* A sibling of the opener, not inside it, so a press in the panel does
          not bubble back up and open it again. */}
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        tabIndex={-1}
        // The panel has no padding of its own, so only a press on the dim
        // room around it lands on the dialog itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(100%-2rem,30rem)] border border-line bg-band p-0 text-ink outline-none backdrop:bg-plank-shadow/80"
      >
        <div className="p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="w-16 shrink-0">
              <Cover title={title} author={card.authors.join(", ") || null} coverUrl={card.coverUrl} />
            </div>
            <div className="min-w-0">
              <h2 id={headingId} className="font-serif text-2xl leading-tight font-semibold break-words">
                {finishing ? `Finished ${title}` : title}
              </h2>
              <p className="mt-1 font-narrow text-ink-dim">{finishing ? "How was it, out of ten?" : subtitle}</p>
            </div>
          </div>

          {finishing ? (
            <form
              className="mt-5"
              action={async (formData) => {
                await setShelf(formData);
                close();
              }}
            >
              <input type="hidden" name="editionId" value={card.editionId} />
              <input type="hidden" name="shelf" value="finished" />
              <RatingAnswers rating={card.rating} onCancel={() => setFinishing(false)} />
            </form>
          ) : (
            <>
              <form
                aria-label="Shelf"
                className="-mx-5 mt-5 overflow-x-auto px-5 text-[13px] sm:mx-0 sm:px-0 sm:text-[14px]"
                action={async (formData) => {
                  await setShelf(formData);
                  close();
                }}
              >
                <input type="hidden" name="editionId" value={card.editionId} />
                <ShelfButtons current={card.status} onCurrent={close} onFinish={() => setFinishing(true)} />
              </form>

              <div className="mt-5 flex gap-2">
                <Link href={`/edition/${card.editionId}`} className="btn btn-sm">
                  Open the book
                </Link>
                <div className="flex-1" />
                <button type="button" onClick={close} className="btn btn-sm">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function ShelfButtons({
  current,
  onCurrent,
  onFinish,
}: {
  current: string;
  onCurrent: () => void;
  onFinish: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="segmented">
      {SHELVES.map((value) =>
        value === current ? (
          <button key={value} type="button" aria-pressed="true" onClick={onCurrent}>
            {SHELF_LABELS[value]}
          </button>
        ) : value === "finished" ? (
          <button key={value} type="button" disabled={pending} onClick={onFinish}>
            {SHELF_LABELS[value]}
          </button>
        ) : (
          <button key={value} type="submit" name="shelf" value={value} disabled={pending}>
            {SHELF_LABELS[value]}
          </button>
        ),
      )}
    </div>
  );
}
