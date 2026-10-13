import { SHELF_LABELS, SHELVES, type Shelf } from "@/lib/shelves";

/**
 * Visible on every add, defaulting to To read — including for books not out
 * yet. Nothing moves an entry between shelves afterwards on its own.
 */
export function ShelfPicker({ defaultValue = "tbr" }: { defaultValue?: Shelf }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-narrow text-ink-dim">Shelf</span>
      <select
        name="shelf"
        defaultValue={defaultValue}
        className="w-fit field"
      >
        {SHELVES.map((shelf) => (
          <option key={shelf} value={shelf}>
            {SHELF_LABELS[shelf]}
          </option>
        ))}
      </select>
    </label>
  );
}
