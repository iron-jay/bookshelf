"use client";

import { useActionState, useState } from "react";

import {
  approveCover,
  coverFromUrl,
  lookUpCoverAgain,
  removeCover,
  uploadCover,
  type CoverState,
} from "./cover-actions";
import { CoverPicker } from "./cover-picker";
import { FilePicker } from "./file-picker";

const BUTTON =
  "w-fit border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";
const LINK = "font-narrow text-ink-dim underline hover:text-ink disabled:no-underline";

function Target({ kind, id }: { kind: "work" | "edition"; id: string }) {
  return (
    <>
      <input type="hidden" name="targetKind" value={kind} />
      <input type="hidden" name="targetId" value={id} />
    </>
  );
}

/**
 * Every way to change one cover (§4a): choose from covers found, upload,
 * paste an address, look it up again, remove. The body of a cover page
 * (cover-page.tsx) — its own page, since tucked under a small cover it was
 * hard to find and too cramped to judge covers in.
 */
export function CoverEditor({
  kind,
  id,
  hasOwnCover,
  needsReview,
  canLookUp,
  note,
  seedTerm,
}: {
  kind: "work" | "edition";
  id: string;
  hasOwnCover: boolean;
  needsReview: boolean;
  /** False for fan translations: nothing is ever looked up for them. */
  canLookUp: boolean;
  /** A line saying whose cover is on screen, when it is not this row's own. */
  note?: string | null;
  /** What the picker searches for first: the title and author. */
  seedTerm: string;
}) {
  const [uploadState, upload, uploading] = useActionState<CoverState, FormData>(uploadCover, null);
  const [urlState, fromUrl, fetching] = useActionState<CoverState, FormData>(coverFromUrl, null);
  const [lookupState, lookUp, looking] = useActionState<CoverState, FormData>(lookUpCoverAgain, null);
  const [removeState, remove, removing] = useActionState<CoverState, FormData>(removeCover, null);
  const busy = uploading || fetching || looking || removing;
  // The message of whichever form was submitted last, not whichever answered first.
  const [last, setLast] = useState<"upload" | "url" | "lookup" | "remove" | null>(null);
  const state = last ? { upload: uploadState, url: urlState, lookup: lookupState, remove: removeState }[last] : null;

  return (
    <div className="flex flex-col gap-8 font-narrow">
      {note ? <p className="text-ink-dim">{note}</p> : null}

      {needsReview ? (
        <form action={approveCover} className="flex items-center gap-3">
          <Target kind={kind} id={id} />
          <span>Found by title, so it may be the wrong book.</span>
          <button type="submit" className={BUTTON}>
            It’s right
          </button>
        </form>
      ) : null}

      {canLookUp ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Covers found</h2>
          <CoverPicker kind={kind} id={id} seedTerm={seedTerm} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Your own image</h2>
        <form action={upload} onSubmit={() => setLast("upload")} className="flex flex-wrap items-center gap-3">
          <Target kind={kind} id={id} />
          <FilePicker name="cover" accept="image/jpeg,image/png,image/webp" label="Choose image" />
          <button type="submit" disabled={busy} className={BUTTON}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>

        <form action={fromUrl} onSubmit={() => setLast("url")} className="flex flex-wrap items-center gap-3">
          <Target kind={kind} id={id} />
          <input
            name="url"
            type="url"
            placeholder="https://… image address"
            aria-label="Image address"
            className="w-72 border border-line bg-ground px-3 py-1.5 text-ink outline-none focus:border-ink-dim"
          />
          <button type="submit" disabled={busy} className={BUTTON}>
            {fetching ? "Fetching…" : "Use this image"}
          </button>
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {canLookUp ? (
          <form action={lookUp} onSubmit={() => setLast("lookup")}>
            <Target kind={kind} id={id} />
            <button type="submit" disabled={busy} className={LINK}>
              {looking ? "Looking…" : "Look it up again"}
            </button>
          </form>
        ) : null}
        {hasOwnCover ? (
          <form action={remove} onSubmit={() => setLast("remove")}>
            <Target kind={kind} id={id} />
            <button type="submit" disabled={busy} className={LINK}>
              {removing ? "Removing…" : "Remove cover"}
            </button>
          </form>
        ) : null}
      </div>

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-ink-dim" : "border-l-2 border-ink-dim pl-3"}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
