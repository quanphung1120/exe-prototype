"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useClerk } from "@clerk/nextjs"
import { useSignIn } from "@clerk/nextjs/legacy"
import { ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Link, useRouter } from "@/i18n/navigation"

import { formField } from "./form-field"

/**
 * Password-only sign-in for the admin workspace. The role lives in Clerk
 * `publicMetadata.role` (granted in the Clerk dashboard), so once the session
 * is active we check it and immediately sign a non-admin back out instead of
 * dropping them into the player dashboard. `/app/admin`'s layout still guards
 * the route server-side — this is the UX gate, not the security boundary.
 */
export function AdminSignInForm() {
  const t = useTranslations("Auth")
  const router = useRouter()
  const clerk = useClerk()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await signIn.create({
        identifier: formField(form, "email"),
        password: formField(form, "password"),
      })
      if (res.status !== "complete") {
        setError(t("signIn.error"))
        setLoading(false)
        return
      }
      await setActive({ session: res.createdSessionId })
      if (clerk.user?.publicMetadata?.role !== "admin") {
        await clerk.signOut()
        setError(t("adminSignIn.notAdmin"))
        setLoading(false)
        return
      }
      router.push("/app/admin")
      router.refresh()
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
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("adminSignIn.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("adminSignIn.subtitle")}
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
        <Link href="/sign-in" className="hover:text-foreground hover:underline">
          {t("adminSignIn.backToSignIn")}
        </Link>
      </p>
    </div>
  )
}
