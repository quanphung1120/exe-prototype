"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useSignIn } from "@clerk/nextjs/legacy"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Link, useRouter } from "@/i18n/navigation"

import { AuthDivider, GoogleButton } from "./google-button"

export function SignInForm() {
  const t = useTranslations("Auth")
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await signIn.create({
        identifier: String(form.get("email")),
        password: String(form.get("password")),
      })
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId })
        router.push("/dashboard")
        router.refresh()
        return
      }
      setError(t("signIn.error"))
      setLoading(false)
    } catch (err) {
      const message =
        (err as { errors?: { message?: string }[] }).errors?.[0]?.message ??
        t("signIn.error")
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("signIn.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("signIn.subtitle")}</p>
      </div>

      <GoogleButton />
      <AuthDivider />

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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("signIn.forgot")}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder={t("passwordPlaceholder")}
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
          {loading ? t("signIn.submitting") : t("signIn.submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary hover:underline"
        >
          {t("signIn.signUpLink")}
        </Link>
      </p>
    </div>
  )
}
