import { hash, verify } from "@node-rs/argon2";

// OWASP's Argon2id reference configuration: 19 MiB, 2 iterations, 1 lane.
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, OPTIONS);
  } catch {
    // A malformed digest means the row is corrupt, not that the caller guessed
    // right. Fail closed rather than throwing out of the login route.
    return false;
  }
}

let decoy: Promise<string> | undefined;

/**
 * Spend roughly the same time an unsuccessful verify would, so that "no such
 * user" and "wrong password" are indistinguishable. Without this, login doubles
 * as a username oracle for anyone timing the response.
 */
export async function burnVerificationTime(password: string): Promise<void> {
  decoy ??= hashPassword("decoy");
  await verifyPassword(await decoy, password);
}
