"use client"

import { usePathname } from "@/i18n/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/app-sidebar"
import { DashboardTopbar } from "@/features/dashboard/topbar"

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Home, player play, player chat and player bookings share the same blue
  // header and drop the sidebar. The venue operator inbox and other dashboard
  // routes keep the inset sidebar layout.
  const isHome = pathname === "/app"
  const isPlayerChat = pathname === "/app/chat"
  const isPlayerBookings = pathname === "/app/bookings"
  const isPlayerPlay = pathname === "/app/play"
  const isPlayerBook = pathname === "/app/book"
  // SePay's return page (/app/payment/success/<id>) is part of the player flow.
  const isPlayerPayment = pathname.startsWith("/app/payment/")
  const isPlayerSurface =
    isHome ||
    isPlayerChat ||
    isPlayerBookings ||
    isPlayerPlay ||
    isPlayerBook ||
    isPlayerPayment

  return (
    <SidebarProvider className="font-geist h-svh">
      {!isPlayerSurface && <AppSidebar />}
      <SidebarInset className="overflow-hidden">
        <DashboardTopbar />
        <main
          className={
            isHome ||
            isPlayerBookings ||
            isPlayerPlay ||
            isPlayerBook ||
            isPlayerPayment
              ? "min-h-0 flex-1 overflow-y-auto bg-white"
              : isPlayerChat
                ? "min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
                : "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          }
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
