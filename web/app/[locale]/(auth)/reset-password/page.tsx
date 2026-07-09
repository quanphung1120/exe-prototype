import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { ResetPasswordForm } from "@/features/auth/reset-password-form"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Auth" })
  return { title: t("reset.title") }
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetPasswordForm token={token} />
}
