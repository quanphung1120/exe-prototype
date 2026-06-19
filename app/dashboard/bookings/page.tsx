import type { Metadata } from "next"

import { BookingsView } from "@/components/dashboard/views/bookings"

export const metadata: Metadata = {
  title: "Bookings",
  description: "Your upcoming and past court bookings.",
}

export default function BookingsPage() {
  return <BookingsView />
}
