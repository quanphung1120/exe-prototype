import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { AdminSignInForm } from "@/features/auth/admin-sign-in-form"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Auth" })
  return { title: t("adminSignIn.title") }
}

export default function AdminSignInPage() {
  return <AdminSignInForm />
}
