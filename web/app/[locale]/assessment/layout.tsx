import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export default async function AssessmentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession()
  if (!session) {
    redirect("/" + locale + "/sign-in")
  }
  return <>{children}</>
}
