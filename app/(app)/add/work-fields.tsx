"use client";

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/** Title and authors for a book created by hand. */
export function WorkFields({ defaultTitle = "" }: { defaultTitle?: string }) {
  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex min-w-64 flex-[2] flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Title</span>
        <input name="title" required defaultValue={defaultTitle} maxLength={500} className={FIELD} />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Author, or authors separated by commas</span>
        <input name="authors" maxLength={1000} className={FIELD} />
      </label>
    </div>
  );
}
