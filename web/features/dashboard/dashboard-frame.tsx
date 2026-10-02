"use client"

import { usePathname } from "@/i18n/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/app-sidebar"
import { DashboardTopbar } from "@/features/dashboard/topbar"

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHome = pathname === "/app"
  // Player chat owns the full viewport (blue header + two panes) like home —
  // but the venue operator inbox (`/app/venue/[venueId]/messages`) keeps the
  // sidebar and padded layout.
  const isPlayerChat = pathname === "/app/chat"

  return (
    <SidebarProvider className="font-geist h-svh">
      {!(isHome || isPlayerChat) && <AppSidebar />}
      <SidebarInset className="overflow-hidden">
        <DashboardTopbar />
        <main
          className={
            isHome
              ? "min-h-0 flex-1 overflow-y-auto bg-white"
              : isPlayerChat
                ? "min-h-0 flex-1 overflow-hidden"
                : "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          }
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
