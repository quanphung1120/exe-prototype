"use client"

import { useState, useTransition } from "react"
import { Check, Languages } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
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
export function LocaleSwitcher({
  className,
  popupClassName,
}: {
  className?: string
  popupClassName?: string
}) {
  const t = useTranslations("LocaleSwitcher")
  const activeLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const switchTo = (next: Locale) => {
    setOpen(false)
    if (next === activeLocale) return
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    // Non-modal + controlled so pressing the trigger again always closes it.
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("label")}
            disabled={isPending}
            className={className}
          >
            <Languages />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={cn("min-w-40", popupClassName)}
      >
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
