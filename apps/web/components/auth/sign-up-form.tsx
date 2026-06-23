"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signUp } from "@/lib/auth-client"
import { Link, useRouter } from "@/i18n/navigation"

import { AuthDivider, GoogleButton } from "./google-button"

export function SignUpForm() {
  const t = useTranslations("Auth")
  const locale = useLocale()
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const { error } = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      // Absolute web URL baked into the verification email link.
      callbackURL: new URL(
        `/${locale}/dashboard`,
        window.location.origin
      ).toString(),
    })
    if (error) {
      setError(error.message ?? t("signUp.error"))
      setLoading(false)
      return
    }
    // autoSignIn is on, so a session already exists — go straight to the app.
    router.push("/dashboard")
    router.refresh()
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
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
