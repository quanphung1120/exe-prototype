"use client"

import * as React from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Audience = "player" | "venue"
type Status = "idle" | "loading" | "success"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COPY: Record<
  Audience,
  { placeholder: string; cta: string; success: string; note: string }
> = {
  player: {
    placeholder: "email@cuaquykhach.com",
    cta: "Đăng ký danh sách chờ",
    success:
      "Quý khách đã có trong danh sách! Chúng tôi sẽ sớm gửi email lời mời truy cập sớm.",
    note: "Miễn phí tham gia · Không spam · Lời mời truy cập sớm được gửi hằng tuần.",
  },
  venue: {
    placeholder: "email công việc của Quý khách",
    cta: "Yêu cầu demo đối tác",
    success:
      "Cảm ơn Quý khách! Đội ngũ phụ trách địa điểm sẽ liên hệ trong vòng 2 ngày làm việc.",
    note: "Dành cho câu lạc bộ & cơ sở · Xem cách AI lấp đầy sân giờ thấp điểm.",
  },
}

export function WaitlistForm({
  audience = "player",
  className,
  inputId = "waitlist-email",
}: {
  audience?: Audience
  className?: string
  inputId?: string
}) {
  const [email, setEmail] = React.useState("")
  const [status, setStatus] = React.useState<Status>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const copy = COPY[audience]
  const errorId = `${inputId}-error`

  function validate(value: string): string | null {
    if (!value.trim()) return "Vui lòng nhập địa chỉ email của Quý khách."
    if (!EMAIL_RE.test(value.trim()))
      return "Địa chỉ email có vẻ chưa hợp lệ."
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
          "flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">{copy.success}</p>
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
            Địa chỉ email
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
              "h-12 w-full rounded-2xl border bg-background px-4 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none disabled:opacity-60",
              error ? "border-destructive" : "border-input"
            )}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={status === "loading"}
          className="h-12 cursor-pointer px-6 text-base"
          data-icon="inline-end"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Đang gửi…
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
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{copy.note}</p>
        )}
      </div>
    </form>
  )
}
