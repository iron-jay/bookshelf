"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { changeAccountPassword, renameAccount } from "@/lib/auth/account";
import { readSessionToken, revokeDeviceSession } from "@/lib/auth/session";

export type AccountState = { ok: boolean; message: string } | null;

/** The rules are `lib/auth/account.ts`, shared with the phone's `/me`. */
export async function updateAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const result = await renameAccount(user.id, String(formData.get("username") ?? ""), String(formData.get("displayName") ?? ""));
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/");
  }
  return result;
}

export type PasswordState = { ok: boolean; message: string } | null;

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  return changeAccountPassword(
    user.id,
    {
      current: String(formData.get("currentPassword") ?? ""),
      next: String(formData.get("newPassword") ?? ""),
      confirm: String(formData.get("confirmPassword") ?? ""),
    },
    await readSessionToken(),
  );
}

/** Sign a phone out from here, for one that is lost or no longer yours. */
export async function revokeDevice(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await revokeDeviceSession(user.id, id);
  revalidatePath("/settings");
}
