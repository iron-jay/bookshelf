"use client";

import { useActionState } from "react";

import { changePassword, type PasswordState } from "./actions";

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);

  return (
    <form action={action} className="mt-3 flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Current password</span>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">New password</span>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">New password again</span>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
        className="self-start border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
