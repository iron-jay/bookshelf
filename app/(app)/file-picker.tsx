"use client";

import { useState } from "react";

/**
 * A file input that looks like the rest of the app.
 *
 * The native control renders differently in every browser and its button says
 * whatever the browser feels like — usually something small and grey that does
 * not read as the thing you are meant to press. The real input is still there,
 * just visually hidden, so the label, keyboard focus and form submission all
 * behave normally.
 */
export function FilePicker({
  name,
  accept,
  label = "Choose file",
  onPick,
}: {
  name: string;
  accept?: string;
  label?: string;
  onPick?: (filename: string | null) => void;
}) {
  const [filename, setFilename] = useState<string | null>(null);

  return (
    <span className="flex flex-wrap items-center gap-3">
      <label className="cursor-pointer border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim focus-within:border-ink">
        {label}
        <input
          name={name}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0]?.name ?? null;
            setFilename(picked);
            onPick?.(picked);
          }}
        />
      </label>

      <span className="font-narrow text-ink-dim">{filename ?? "No file chosen"}</span>
    </span>
  );
}
