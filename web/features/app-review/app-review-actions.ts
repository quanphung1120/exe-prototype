"use server"

import { revalidatePath } from "next/cache"

import type { MyAppReview } from "@/lib/shared"
import { apiAction, apiFetch } from "@/lib/api"

// Server actions for the signed-in user's review of the app itself
// (`api/src/features/app-reviews/`). Saving revalidates the landing page so a
// new featured quote shows up without waiting out its ISR window.

/** The caller's own review, or null if they haven't left one yet. */
export async function getMyAppReview(): Promise<MyAppReview | null> {
  return apiFetch<MyAppReview | null>("/api/app-reviews/me")
}

/** Create or edit the caller's review. */
export async function saveAppReview(input: {
  rating: number
  comment: string
}): Promise<MyAppReview> {
  const saved = await apiAction<MyAppReview>("/api/app-reviews/me", {
    method: "PUT",
    body: JSON.stringify(input),
  })
  revalidatePath("/[locale]", "page")
  return saved
}
