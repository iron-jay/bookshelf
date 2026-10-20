import Link from "next/link";

import type { Removal } from "@/lib/books/removal";

function counted(total: number, one: string, many: string): string {
  return `${total} ${total === 1 ? one : many}`;
}

/**
 * Says what a delete takes with it. Shared by the book and edition pages so
 * the two cannot describe the same cascade differently.
 */
export function RemovalSummary({ removal }: { removal: Removal }) {
  const lines = [
    counted(removal.editionCount, "edition", "editions"),
    counted(removal.entryCount, "shelf entry", "shelf entries"),
  ];
  if (removal.readCount > 0) lines.push(counted(removal.readCount, "read", "reads"));
  const dependents = removal.dependentEditions;

  return (
    <div className="max-w-2xl">
      <p className="font-narrow">This removes {lines.join(", ")}.</p>

      {dependents.length > 0 ? (
        <div className="mt-4 border-l-2 border-ink-dim pl-3">
          <p className="font-narrow">
            {dependents.length === 1 ? "One edition is" : "These editions are"} made from what you are
            deleting. {dependents.length === 1 ? "It" : "They"} will stay, but stop saying what{" "}
            {dependents.length === 1 ? "it was" : "they were"} made from.
          </p>
          <ul className="mt-2 flex flex-col">
            {dependents.map((edition) => (
              <li key={edition.id} className="font-narrow text-ink-dim">
                <Link href={`/edition/${edition.id}`} className="underline hover:text-ink">
                  {edition.name}
                </Link>
                , {edition.workTitle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 font-narrow text-ink-dim">This cannot be undone.</p>
    </div>
  );
}
