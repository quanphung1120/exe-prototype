"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { Link, useRouter } from "@/i18n/navigation"

export function ResetPasswordForm({ token }: { token?: string }) {
  const t = useTranslations("Auth")
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    const confirm = String(form.get("confirm"))
    if (password !== confirm) {
      setError(t("reset.mismatch"))
      return
    }
    if (!token) {
      setError(t("reset.invalidToken"))
      return
    }
    setLoading(true)
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    })
    setLoading(false)
    if (error) {
      setError(t("reset.error"))
      return
    }
    setDone(true)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("reset.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("reset.subtitle")}</p>
      </div>

      {!token ? (
        <p className="text-sm text-destructive">{t("reset.invalidToken")}</p>
      ) : done ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("reset.success")}
          </p>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => router.push("/sign-in")}
          >
            {t("signIn.submit")}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("reset.passwordLabel")}</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t("reset.confirmLabel")}</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              placeholder={t("passwordPlaceholder")}
              minLength={8}
              required
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t("reset.submitting") : t("reset.submit")}
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
