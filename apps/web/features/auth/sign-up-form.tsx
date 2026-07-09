"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSignUp } from "@clerk/nextjs/legacy"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Link, useRouter } from "@/i18n/navigation"

import { AuthDivider, GoogleButton } from "./google-button"

// Clerk sign-up is two steps (credentials, then an emailed 6-digit code). The
// verification step has no existing translation keys, so its copy is inlined
// per locale to stay consistent with the bilingual auth surface.
const verifyCopy = {
  vi: {
    title: "Xác thực email",
    subtitle: "Nhập mã gồm 6 chữ số đã gửi tới email của bạn.",
    codeLabel: "Mã xác thực",
    submit: "Xác thực",
    submitting: "Đang xác thực…",
    error: "Mã không đúng, vui lòng thử lại",
  },
  en: {
    title: "Verify your email",
    subtitle: "Enter the 6-digit code we sent to your email.",
    codeLabel: "Verification code",
    submit: "Verify",
    submitting: "Verifying…",
    error: "That code is incorrect, please try again",
  },
} as const

export function SignUpForm() {
  const t = useTranslations("Auth")
  const locale = useLocale()
  const v = verifyCopy[locale === "en" ? "en" : "vi"]
  const router = useRouter()
  const { signUp, setActive, isLoaded } = useSignUp()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [verifying, setVerifying] = React.useState(false)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      await signUp.create({
        firstName: String(form.get("name")),
        emailAddress: String(form.get("email")),
        password: String(form.get("password")),
      })
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      setVerifying(true)
      setLoading(false)
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        t("signUp.error")
      setError(message)
      setLoading(false)
    }
  }

  const onVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await signUp.attemptEmailAddressVerification({
        code: String(form.get("code")),
      })
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId })
        router.push("/dashboard")
        router.refresh()
        return
      }
      setError(v.error)
      setLoading(false)
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        v.error
      setError(message)
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {v.title}
          </h1>
          <p className="text-sm text-muted-foreground">{v.subtitle}</p>
        </div>

        <form onSubmit={onVerify} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">{v.codeLabel}</Label>
            <Input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              required
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || !isLoaded}
          >
            {loading ? v.submitting : v.submit}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t("signUp.haveAccount")}{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary hover:underline"
          >
            {t("signUp.signInLink")}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("signUp.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("signUp.subtitle")}</p>
      </div>

      <GoogleButton />
      <AuthDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("signUp.nameLabel")}</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder={t("signUp.namePlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={t("passwordPlaceholder")}
            minLength={8}
            required
          />
        </div>

        {/* Mount point for Clerk's Smart CAPTCHA (bot sign-up protection).
            Without it, signUp.create() falls back to the Invisible CAPTCHA and
            warns. Clerk renders the widget here only when a challenge is needed. */}
        <div id="clerk-captcha" />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loading || !isLoaded}
        >
          {loading ? t("signUp.submitting") : t("signUp.submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signUp.haveAccount")}{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary hover:underline"
        >
          {t("signUp.signInLink")}
        </Link>
      </p>
    </div>
  )
}
