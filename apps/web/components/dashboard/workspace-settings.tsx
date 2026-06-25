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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Venue } from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { ResetPlayerAssessmentButton } from "@/components/dashboard/player-assessment-gate"
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
  // Venue-only profile fields (seeded from the active venue; unused for players).
  const [image, setImage] = React.useState(venue.image ?? "")
  const [imageBroken, setImageBroken] = React.useState(false)
  const [description, setDescription] = React.useState(venue.description ?? "")
  const [openFrom, setOpenFrom] = React.useState(venue.openFrom)
  const [openTo, setOpenTo] = React.useState(venue.openTo)
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const trimmed = name.trim()
  const trimmedImage = image.trim()
  const nameInvalid = touched && trimmed.length < 2
  // Closing time must come after opening (lexical compare is safe for HH:MM).
  const hoursInvalid = isVenue && (!openFrom || !openTo || openFrom >= openTo)

  const dirty = isVenue
    ? trimmed !== venue.name.trim() ||
      trimmedImage !== (venue.image ?? "") ||
      description.trim() !== (venue.description ?? "") ||
      openFrom !== venue.openFrom ||
      openTo !== venue.openTo
    : trimmed !== initial.trim()

  const tile = isVenue ? venue.initials : initials
  const showImage = isVenue && trimmedImage.length > 0 && !imageBroken

  const save = async () => {
    setTouched(true)
    if (trimmed.length < 2) return
    if (hoursInvalid) return
    if (!dirty) {
      onClose()
      return
    }
    if (isVenue) {
      setSaving(true)
      try {
        await updateVenue(activeVenueId, {
          name: trimmed,
          image: trimmedImage,
          description: description.trim(),
          openFrom,
          openTo,
        })
        router.refresh()
        toast.success(t("venueUpdated"))
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
          <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary font-heading text-sm font-bold text-secondary-foreground">
            {showImage ? (
              // Prototype previews an arbitrary external URL; next/image would
              // need per-host allowlisting, so a plain <img> is the right tool.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={trimmedImage}
                alt=""
                className="size-full object-cover"
                onError={() => setImageBroken(true)}
              />
            ) : (
              tile
            )}
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

        <Field data-invalid={nameInvalid}>
          <FieldLabel htmlFor="ws-name">
            {isVenue ? t("venueNameLabel") : t("nameLabel")}
          </FieldLabel>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={nameInvalid}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
            autoFocus
          />
          {nameInvalid ? (
            <p className="text-sm text-destructive">{t("validation.name")}</p>
          ) : null}
        </Field>

        {!isVenue ? <ResetPlayerAssessmentButton /> : null}

        {/* Venue profile — photo, description, and working hours. */}
        {isVenue ? (
          <>
            <Field>
              <FieldLabel htmlFor="ws-image">{t("venueImageLabel")}</FieldLabel>
              <Input
                id="ws-image"
                type="url"
                inputMode="url"
                value={image}
                onChange={(e) => {
                  setImage(e.target.value)
                  setImageBroken(false)
                }}
                placeholder={t("venueImagePlaceholder")}
                autoComplete="off"
              />
              <FieldDescription>{t("venueImageHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="ws-description">
                {t("venueDescriptionLabel")}
              </FieldLabel>
              <Textarea
                id="ws-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("venueDescriptionPlaceholder")}
              />
            </Field>

            <Field data-invalid={touched && hoursInvalid}>
              <FieldLabel>{t("hoursLabel")}</FieldLabel>
              <div className="flex items-end gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    htmlFor="ws-open-from"
                    className="text-xs text-muted-foreground"
                  >
                    {t("openFrom")}
                  </label>
                  <Input
                    id="ws-open-from"
                    type="time"
                    value={openFrom}
                    onChange={(e) => setOpenFrom(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={touched && hoursInvalid}
                    className="tabular-nums"
                  />
                </div>
                <span className="pb-2 text-muted-foreground">–</span>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    htmlFor="ws-open-to"
                    className="text-xs text-muted-foreground"
                  >
                    {t("openTo")}
                  </label>
                  <Input
                    id="ws-open-to"
                    type="time"
                    value={openTo}
                    onChange={(e) => setOpenTo(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={touched && hoursInvalid}
                    className="tabular-nums"
                  />
                </div>
              </div>
              {touched && hoursInvalid ? (
                <p className="text-sm text-destructive">
                  {t("validation.hours")}
                </p>
              ) : null}
            </Field>
          </>
        ) : null}

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
