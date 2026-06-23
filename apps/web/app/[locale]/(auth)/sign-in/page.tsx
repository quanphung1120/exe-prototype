import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { SignInForm } from "@/components/auth/sign-in-form"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Auth" })
  return { title: t("signIn.title") }
}

export default function SignInPage() {
  return <SignInForm />
}
