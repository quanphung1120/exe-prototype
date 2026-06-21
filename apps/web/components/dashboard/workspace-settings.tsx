"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Building2, Mail, UserRound, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { Venue } from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { updateVenue } from "@/lib/venue-actions"
import { useRouter } from "@/i18n/navigation"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whether the venue workspace is active (vs. the player workspace). */
  isVenue: boolean
  /** The active venue — used (and renamed) only in the venue workspace. */
  venue: Venue
  activeVenueId: string
  /** Two-letter mark shown in the identity tile. */
  initials: string
}

/**
 * Lightweight settings for the *current* workspace, opened from the sidebar.
 * The player workspace renames the player (client-side, via the session store);
 * the venue workspace renames the active venue (persisted through the API) and
 * previews the post-MVP staff invites — intentionally disabled for now.
 */
export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  isVenue,
  venue,
  activeVenueId,
  initials,
}: Props) {
  const t = useTranslations("WorkspaceSettings")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        {open ? (
          // Remount per workspace/venue so the name field re-seeds on open.
          <SettingsForm
            key={isVenue ? `venue:${activeVenueId}` : "player"}
            isVenue={isVenue}
            venue={venue}
            activeVenueId={activeVenueId}
            initials={initials}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({
  isVenue,
  venue,
  activeVenueId,
  initials,
  onClose,
}: {
  isVenue: boolean
  venue: Venue
  activeVenueId: string
  initials: string
  onClose: () => void
}) {
  const t = useTranslations("WorkspaceSettings")
  const router = useRouter()
  const { userName, setUserName } = useMatchmaking()

  const initial = isVenue ? venue.name : userName
  const [name, setName] = React.useState(initial)
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const trimmed = name.trim()
  const invalid = touched && trimmed.length < 2
  const dirty = trimmed !== initial.trim()

  const tile = isVenue ? venue.initials : initials

  const save = async () => {
    setTouched(true)
    if (trimmed.length < 2) return
    if (!dirty) {
      onClose()
      return
    }
    if (isVenue) {
      setSaving(true)
      try {
        await updateVenue(activeVenueId, { name: trimmed })
        router.refresh()
        toast.success(t("nameUpdated"))
        onClose()
      } catch (err) {
        toast.error(t("error"), {
          description: err instanceof Error ? err.message : undefined,
        })
      } finally {
        setSaving(false)
      }
    } else {
      setUserName(trimmed)
      toast.success(t("nameUpdated"))
      onClose()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>
          {isVenue ? t("venueDescription") : t("playerDescription")}
        </DialogDescription>
      </DialogHeader>

      <div className="my-5 flex flex-col gap-5">
        {/* Identity preview */}
        <div className="flex items-center gap-3 rounded-3xl bg-muted/40 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-heading text-sm font-bold text-secondary-foreground">
            {tile}
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading font-bold">
              {trimmed || initial}
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {isVenue ? (
                <Building2 className="size-3" />
              ) : (
                <UserRound className="size-3" />
              )}
              {isVenue ? t("venueScope") : t("playerScope")}
            </p>
          </div>
        </div>

        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="ws-name">
            {isVenue ? t("venueNameLabel") : t("nameLabel")}
          </FieldLabel>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={invalid}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
            autoFocus
          />
          {invalid ? (
            <p className="text-sm text-destructive">{t("validation.name")}</p>
          ) : null}
        </Field>

        {/* Staff invites — previewed, disabled until after the MVP. */}
        {isVenue ? (
          <div className="rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-muted-foreground" />
                {t("staff.title")}
              </span>
              <Badge variant="secondary">{t("staff.soon")}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("staff.description")}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  className="pl-8"
                  placeholder={t("staff.emailPlaceholder")}
                  disabled
                  aria-label={t("staff.emailPlaceholder")}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled
              >
                {t("staff.invite")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter className="flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onClose}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" className="rounded-full" disabled={saving}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  )
}
