"use client"

import { useTransition } from "react"
import { Check, Languages } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing, type Locale } from "@/i18n/routing"

/** Switches the active locale while preserving the current pathname. */
export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher")
  const activeLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const switchTo = (next: Locale) => {
    if (next === activeLocale) return
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("label")}
            disabled={isPending}
          >
            <Languages />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-40">
        {routing.locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchTo(locale)}
            className="justify-between"
          >
            {t(locale)}
            {locale === activeLocale ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
