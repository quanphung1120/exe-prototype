import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { ForgotPasswordForm } from "@/features/auth/forgot-password-form"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Auth" })
  return { title: t("forgot.title") }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
