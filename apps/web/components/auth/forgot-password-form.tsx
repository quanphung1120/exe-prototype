"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { Link } from "@/i18n/navigation"

export function ForgotPasswordForm() {
  const t = useTranslations("Auth")
  const locale = useLocale()
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email")),
      // Where the email link lands; the token is appended as a query param.
      redirectTo: new URL(
        `/${locale}/reset-password`,
        window.location.origin
      ).toString(),
    })
    setLoading(false)
    if (error) {
      setError(t("forgot.error"))
      return
    }
    setSent(true)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("forgot.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("forgot.subtitle")}</p>
      </div>

      {sent ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("forgot.sent")}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
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

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
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
