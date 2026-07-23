"use client"

import * as React from "react"
import { Menu, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useUser } from "@clerk/nextjs"

import { cn } from "@/lib/utils"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"

const NAV_LINKS = [
  { key: "about", href: "#about" },
  { key: "features", href: "#features" },
  { key: "howItWorks", href: "#how-it-works" },
  { key: "pricing", href: "#pricing" },
  { key: "venues", href: "#venues" },
  { key: "faq", href: "#faq" },
]

export function SiteHeader() {
  const t = useTranslations("Header")
  const [open, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  // Public landing page, so default to logged-out: while the session resolves
  // (and for the common anonymous visitor) show "Login"; once an authed session
  // is confirmed, swap to the "Try the demo" shortcut into the dashboard.
  const { isSignedIn, isLoaded } = useUser()
  const isAuthed = isLoaded && Boolean(isSignedIn)
  const authCta = isAuthed
    ? { href: "/dashboard", label: t("demo") }
    : { href: "/sign-in", label: t("login") }

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-300",
        scrolled || open
          ? "border-b border-border bg-background/80 backdrop-blur-lg"
          : "border-b border-transparent bg-background/0"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          aria-label={t("homeAria")}
        >
          <Logo />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle className="cursor-pointer" />
          <Button
            variant="lime"
            size="lg"
            className="hidden cursor-pointer sm:inline-flex"
            nativeButton={false}
            render={<Link href={authCta.href}>{authCta.label}</Link>}
          />
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer md:hidden"
            aria-label={open ? t("menuClose") : t("menuOpen")}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-border bg-background md:hidden"
      >
        <nav
          aria-label="Mobile"
          className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
          <Button
            variant="lime"
            size="lg"
            className="mt-2 cursor-pointer"
            nativeButton={false}
            onClick={() => setOpen(false)}
            render={<Link href={authCta.href}>{authCta.label}</Link>}
          />
        </nav>
      </div>
    </header>
  )
}
