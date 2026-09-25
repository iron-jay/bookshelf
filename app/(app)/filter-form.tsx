"use client";

import { useRef, useSyncExternalStore } from "react";

import { useRouter } from "next/navigation";

import { rememberShelfView } from "./shelf-view";

/**
 * False while rendering on the server, true once hydrated. useSyncExternalStore
 * is the sanctioned way to ask that question — the useEffect-plus-setState
 * version of it is a lint error for good reason.
 */
const NEVER_CHANGES = () => () => {};
function useIsScripted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * The filter row applies as you change it. A change event on the form bubbles
 * from every select and checkbox inside it, so all the controls behave the same
 * way rather than the checkbox being the one special case.
 *
 * Apply is still rendered until the component hydrates, so the page keeps
 * working with JavaScript off — it just disappears once the form can act on its
 * own.
 */
export function FilterForm({
  defaults,
  children,
}: {
  /** Values worth leaving out of the URL because they are what you get anyway. */
  defaults: Record<string, string>;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const scripted = useIsScripted();

  function apply() {
    if (!form.current) return;

    // A plain GET submit would put every control in the URL, including the
    // empty ones and the defaults. These links get bookmarked and shared, so
    // they are worth keeping to the parts that actually mean something.
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form.current).entries()) {
      if (typeof value === "string" && value !== "" && value !== defaults[key]) {
        query.set(key, value);
      }
    }

    const qs = query.toString();

    // Written here, before the navigation, rather than left to the render that
    // follows it. Turning grouping back off produces a bare "/", and the server
    // reads this cookie to decide what a bare "/" means — so if the old value
    // were still in it, the choice to turn something off would undo itself.
    rememberShelfView(qs);

    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <form
      ref={form}
      action="/"
      onChange={apply}
      className="mb-6 flex flex-wrap items-center gap-3 font-narrow"
    >
      {children}
      {scripted ? null : (
        <button
          type="submit"
          className="border border-line bg-panel px-3 py-1.5 hover:border-ink-dim"
        >
          Apply
        </button>
      )}
    </form>
  );
}
