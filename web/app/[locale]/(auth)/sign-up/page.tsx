import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { SignUpForm } from "@/features/auth/sign-up-form"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Auth" })
  return { title: t("signUp.title") }
}

export default function SignUpPage() {
  return <SignUpForm />
}
