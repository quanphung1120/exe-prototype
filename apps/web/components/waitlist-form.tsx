"use client"

import * as React from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Audience = "player" | "venue"
type Tone = "light" | "onDark"
type Status = "idle" | "loading" | "success"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function WaitlistForm({
  audience = "player",
  tone = "light",
  className,
  inputId = "waitlist-email",
}: {
  audience?: Audience
  tone?: Tone
  className?: string
  inputId?: string
}) {
  const t = useTranslations("Waitlist")
  const [email, setEmail] = React.useState("")
  const [status, setStatus] = React.useState<Status>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const onDark = tone === "onDark"
  const copy = {
    placeholder: t(`${audience}.placeholder`),
    cta: t(`${audience}.cta`),
    success: t(`${audience}.success`),
    note: t(`${audience}.note`),
  }
  const errorId = `${inputId}-error`

  function validate(value: string): string | null {
    if (!value.trim()) return t("errors.required")
    if (!EMAIL_RE.test(value.trim())) return t("errors.invalid")
    return null
  }

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    const validationError = validate(email)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStatus("loading")
    // No backend yet — simulate the network request.
    await new Promise((resolve) => setTimeout(resolve, 900))
    setStatus("success")
  }

  if (status === "success") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-4 text-left",
          onDark
            ? "border-white/15 bg-white/10 text-white"
            : "border-primary/30 bg-primary/10 text-foreground",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-lime-foreground">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="text-sm font-medium">{copy.success}</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("w-full", className)}
      aria-describedby={error ? errorId : undefined}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            {t("emailLabel")}
          </label>
          <input
            id={inputId}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            placeholder={copy.placeholder}
            value={email}
            disabled={status === "loading"}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
            onBlur={(e) => {
              if (e.target.value) setError(validate(e.target.value))
            }}
            className={cn(
              "h-12 w-full rounded-2xl border px-4 text-base shadow-sm transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:opacity-60",
              onDark
                ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus-visible:border-white/50 focus-visible:ring-white/20"
                : "bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30",
              error
                ? onDark
                  ? "border-red-400/70"
                  : "border-destructive"
                : onDark
                  ? ""
                  : "border-input"
            )}
          />
        </div>
        <Button
          type="submit"
          variant="lime"
          size="lg"
          disabled={status === "loading"}
          className="h-12 cursor-pointer px-6 text-base"
          data-icon="inline-end"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("submitting")}
            </>
          ) : (
            <>
              {copy.cta}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      <div className="mt-2 min-h-5">
        {error ? (
          <p
            id={errorId}
            role="alert"
            className={cn(
              "text-sm",
              onDark ? "text-red-300" : "text-destructive"
            )}
          >
            {error}
          </p>
        ) : (
          <p
            className={cn(
              "text-xs",
              onDark ? "text-white/60" : "text-muted-foreground"
            )}
          >
            {copy.note}
          </p>
        )}
      </div>
    </form>
  )
}
