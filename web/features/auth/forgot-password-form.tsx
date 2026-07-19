"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSignIn } from "@clerk/nextjs/legacy"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Link, useRouter } from "@/i18n/navigation"

import { formField } from "./form-field"

// Clerk resets passwords with an emailed 6-digit code (no reset URL/token), so
// the whole flow lives here as two steps. The code + new-password step has no
// existing translation keys, so its copy is inlined per locale.
const resetCopy = {
  vi: {
    title: "Đặt lại mật khẩu",
    subtitle: "Nhập mã đã gửi tới email và chọn mật khẩu mới.",
    codeLabel: "Mã xác thực",
    passwordLabel: "Mật khẩu mới",
    submit: "Đặt lại mật khẩu",
    submitting: "Đang đặt lại…",
    error: "Mã không đúng hoặc đã hết hạn, vui lòng thử lại",
  },
  en: {
    title: "Reset your password",
    subtitle: "Enter the code we emailed you and pick a new password.",
    codeLabel: "Verification code",
    passwordLabel: "New password",
    submit: "Reset password",
    submitting: "Resetting…",
    error: "That code is invalid or expired, please try again",
  },
} as const

export function ForgotPasswordForm() {
  const t = useTranslations("Auth")
  const locale = useLocale()
  const r = resetCopy[locale === "en" ? "en" : "vi"]
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onRequest = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: formField(form, "email"),
      })
      setSent(true)
      setLoading(false)
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        t("forgot.error")
      setError(message)
      setLoading(false)
    }
  }

  const onReset = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: formField(form, "code"),
        password: formField(form, "password"),
      })
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId })
        router.push("/dashboard")
        router.refresh()
        return
      }
      setError(r.error)
      setLoading(false)
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        r.error
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {sent ? r.title : t("forgot.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {sent ? r.subtitle : t("forgot.subtitle")}
        </p>
      </div>

      {sent ? (
        <form
          onSubmit={(e) => void onReset(e)}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">{r.codeLabel}</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="password">{r.passwordLabel}</Label>
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || !isLoaded}
          >
            {loading ? r.submitting : r.submit}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => void onRequest(e)}
          className="space-y-4"
        >
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || !isLoaded}
          >
            {loading ? t("forgot.submitting") : t("forgot.submit")}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className="font-medium text-primary hover:underline"
        >
          {t("forgot.backToSignIn")}
        </Link>
      </p>
    </div>
  )
}
