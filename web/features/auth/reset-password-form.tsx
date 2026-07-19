"use client"

import { useLocale } from "next-intl"

import { Link } from "@/i18n/navigation"

// Clerk resets passwords with an emailed 6-digit code on the forgot-password
// route (no emailed reset URL/token), so this page is obsolete — it just points
// users back to the forgot-password flow. The `token` prop is kept for the
// route that still passes a `?token=` search param.
const notice = {
  vi: {
    title: "Đặt lại mật khẩu",
    body: "Trang này không còn được sử dụng. Vui lòng đặt lại mật khẩu bằng mã xác thực gửi qua email.",
    cta: "Tới trang đặt lại mật khẩu",
  },
  en: {
    title: "Reset your password",
    body: "This page is no longer used. Please reset your password with the verification code sent to your email.",
    cta: "Go to password reset",
  },
} as const

export function ResetPasswordForm({ token }: { token?: string }) {
  // `token` is accepted (the route still passes a `?token=` search param) but
  // unused — the reset now happens on the forgot-password route via a code.
  void token
  const locale = useLocale()
  const n = notice[locale === "en" ? "en" : "vi"]

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {n.title}
        </h1>
        <p className="text-sm text-muted-foreground">{n.body}</p>
      </div>

      <Link
        href="/forgot-password"
        className="font-medium text-primary hover:underline"
      >
        {n.cta}
      </Link>
    </div>
  )
}
