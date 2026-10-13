"use client";

import { useActionState } from "react";

import { updateAccount, type AccountState } from "./actions";

const FIELD =
  "field";

export function AccountForm({
  username,
  displayName,
}: {
  username: string;
  displayName: string | null;
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateAccount, null);

  return (
    <form action={action} className="mt-3 flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Username</span>
        <input
          name="username"
          type="text"
          required
          defaultValue={username}
          className={FIELD}
          autoComplete="username"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Display name</span>
        <input
          name="displayName"
          type="text"
          defaultValue={displayName ?? ""}
          placeholder={username}
          className={FIELD}
        />
      </label>

      {state ? (
        <p role="status" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start btn"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
