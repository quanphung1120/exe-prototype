import { cookies } from "next/headers"

import { ACTIVE_VENUE_COOKIE, fetchSeed } from "@/lib/api"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { ChatProvider } from "@/components/dashboard/chat-store"
import { DataProvider } from "@/components/dashboard/data-provider"
import { NotificationsProvider } from "@/components/dashboard/notifications"
import { PlayerChrome } from "@/components/dashboard/player-chrome"
import { SessionProvider } from "@/components/dashboard/session"
import { SportFilterProvider } from "@/components/dashboard/sport-filter"
import { DashboardTopbar } from "@/components/dashboard/topbar"

// The seed is fetched per request from the Hono API, so the dashboard renders
// dynamically (and `next build` never reaches for the API).
export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const activeVenueId = (await cookies()).get(ACTIVE_VENUE_COOKIE)?.value
  const seed = await fetchSeed(activeVenueId)

  return (
    <TooltipProvider>
      <DataProvider seed={seed}>
        <SessionProvider>
          <NotificationsProvider>
            <ChatProvider>
              <SportFilterProvider>
                <SidebarProvider className="font-geist">
                  <AppSidebar />
                  <SidebarInset className="overflow-hidden">
                    <DashboardTopbar />
                    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                      {children}
                    </main>
                  </SidebarInset>
                </SidebarProvider>
              </SportFilterProvider>
            </ChatProvider>
          </NotificationsProvider>
          <PlayerChrome />
          <Toaster />
        </SessionProvider>
      </DataProvider>
    </TooltipProvider>
  )
}
