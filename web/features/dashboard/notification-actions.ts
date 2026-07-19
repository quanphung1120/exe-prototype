"use server"

import type { NotificationRecord } from "@/lib/shared"

import { apiFetch } from "@/lib/api"

// Server actions for the Phase 7 transactional notification feed
// (`api/src/features/notifications/`). `NotificationsProvider` calls these
// directly from the client (no revalidation — it already holds the optimistic
// state) to poll the signed-in user's notifications and mirror read/read-all
// back to the server.

/** The signed-in user's notifications, newest first. */
export async function listNotifications(): Promise<NotificationRecord[]> {
  return apiFetch<NotificationRecord[]>("/api/notifications")
}

/** Mark one notification read (idempotent — a no-op if already read). */
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "PUT",
  })
}

/** Mark every one of the signed-in user's notifications read. */
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "PUT" })
}
