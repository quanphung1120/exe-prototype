"use server"

import { revalidatePath } from "next/cache"
import type { AccountType } from "@/lib/shared"

import { apiFetch } from "@/lib/api"

/** Persist the signed-in account's self-declared type from the onboarding page. */
export async function chooseAccountType(accountType: AccountType): Promise<void> {
  await apiFetch("/api/account", {
    method: "PUT",
    body: { accountType },
  })
  revalidatePath("/dashboard", "layout")
}
