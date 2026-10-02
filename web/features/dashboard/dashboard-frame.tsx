"use client"

import { usePathname } from "@/i18n/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/app-sidebar"
import { DashboardTopbar } from "@/features/dashboard/topbar"

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const isHome = usePathname() === "/app"

  return (
    <SidebarProvider className="font-geist h-svh">
      {!isHome && <AppSidebar />}
      <SidebarInset className="overflow-hidden">
        <DashboardTopbar />
        <main
          className={
            isHome
              ? "min-h-0 flex-1 overflow-y-auto bg-white"
              : "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          }
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
