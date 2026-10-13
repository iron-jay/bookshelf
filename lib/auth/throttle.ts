import { headers } from "next/headers";

/**
 * Failed sign-ins, counted per username and per client address.
 *
 * Argon2 makes each guess slow, which holds a guesser back but does not stop
 * one. Ten failures in fifteen minutes is far more than anybody
 * mistyping their own password needs, and far too few to guess one.
 *
 * In memory on purpose: one process serves the app, a restart forgetting the
 * count costs an attacker a container restart they cannot trigger, and a table
 * for this would be a write on every failed login.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

type Window = { failures: number; startedAt: number };

const globalForThrottle = globalThis as unknown as { loginFailures?: Map<string, Window> };
const failures = (globalForThrottle.loginFailures ??= new Map<string, Window>());

/**
 * The address the reverse proxy saw. Its own entry is the last one in
 * X-Forwarded-For; anything before it came from the client and can say
 * anything. With no proxy in front (dev) there is no header and only the
 * username is counted.
 */
async function clientAddress(): Promise<string | null> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || null;
}

async function keysFor(username: string): Promise<string[]> {
  const keys = [`user:${username.toLowerCase()}`];
  const address = await clientAddress();
  if (address) keys.push(`ip:${address}`);
  return keys;
}

function current(key: string, now: number): Window | undefined {
  const window = failures.get(key);
  if (window && now - window.startedAt > WINDOW_MS) {
    failures.delete(key);
    return undefined;
  }
  return window;
}

/** Seconds until another attempt is allowed, or null when one is allowed now. */
export async function loginBlockedFor(username: string): Promise<number | null> {
  const now = Date.now();
  let wait: number | null = null;

  for (const key of await keysFor(username)) {
    const window = current(key, now);
    if (window && window.failures >= MAX_FAILURES) {
      const seconds = Math.ceil((window.startedAt + WINDOW_MS - now) / 1000);
      wait = Math.max(wait ?? 0, seconds);
    }
  }

  return wait;
}

export async function recordLoginFailure(username: string): Promise<void> {
  const now = Date.now();

  // Expired windows are otherwise only dropped when their key comes back, and a
  // spray of made-up usernames never comes back.
  if (failures.size > 1000) {
    for (const key of [...failures.keys()]) current(key, now);
  }

  for (const key of await keysFor(username)) {
    const window = current(key, now);
    if (window) window.failures += 1;
    else failures.set(key, { failures: 1, startedAt: now });
  }
}

/**
 * Only the username's count: a success proves the password, not that every
 * other attempt from the same address was the same person.
 */
export function clearLoginFailures(username: string): void {
  failures.delete(`user:${username.toLowerCase()}`);
}

export function describeWait(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
