"use client";

import { useActionState } from "react";

import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Username</span>
        <input
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          required
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD}
        />
      </label>

      {/* Marked by position and a hairline rather than colour: --label is the
          only chromatic value in the app and it means community provenance. */}
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="border border-line bg-panel px-3 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
