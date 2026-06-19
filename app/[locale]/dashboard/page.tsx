import type { Metadata } from "next"

import { OverviewView } from "@/components/dashboard/views/overview"

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your SportMatch AI command center — next match, AI player suggestions, nearby courts, bookings and streak.",
}

export default function DashboardPage() {
  return <OverviewView />
}
