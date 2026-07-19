"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import * as z from "zod"
import { Check, Minus, Plus, Search, TriangleAlert, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LEVELS,
  SPORTS,
  diffMinutes,
  locStr,
  type RoomLevel,
  type SportKey,
} from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import {
  useMatchmaking,
  type QuickJoinFilters,
} from "@/features/play/matchmaking"

/** One row of single-select segmented chips built from Button. */
function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={o.value === value ? "default" : "outline"}
            className="rounded-full"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * Quick Join filter dialog. Its open-state lives in the session store so the
 * topbar action and the Match Maker empty-state can both summon it; the filter
 * choices stay local to the dialog and reset only the court search on close.
 */
function QuickJoinDialog() {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const { courts: COURTS } = useData()
  const { quickJoinOpen, setQuickJoinOpen, quickJoin } = useMatchmaking()
  const [maxDistance, setMaxDistance] = React.useState("any") // "2" | "5" | "any"
  const [day, setDay] =
    React.useState<QuickJoinFilters["day"]>("today-tomorrow")
  const [format, setFormat] = React.useState<QuickJoinFilters["format"]>("any")
  const [level, setLevel] = React.useState<QuickJoinFilters["level"]>("my")
  const [quickSport, setQuickSport] = React.useState<SportKey | "all">("all")
  const [quickCourt, setQuickCourt] = React.useState<string>("any")
  const [courtQuery, setCourtQuery] = React.useState("")

  // Courts offered in Quick Join, narrowed to the chosen sport.
  const quickCourts = COURTS.filter(
    (c) => quickSport === "all" || c.sports.includes(quickSport)
  )
  // ...then filtered by the search query (court name or district).
  const courtNeedle = courtQuery.trim().toLowerCase()
  const filteredCourts = courtNeedle
    ? quickCourts.filter(
        (c) =>
          c.name.toLowerCase().includes(courtNeedle) ||
          c.district.toLowerCase().includes(courtNeedle)
      )
    : quickCourts

  const onQuickSportChange = (v: SportKey | "all") => {
    setQuickSport(v)
    const court = COURTS.find((c) => c.id === quickCourt)
    if (v !== "all" && court && !court.sports.includes(v)) setQuickCourt("any")
  }

  const buildFilters = (): QuickJoinFilters => ({
    sport: quickSport,
    courtId: quickCourt === "any" ? null : quickCourt,
    maxDistanceKm: maxDistance === "any" ? null : Number(maxDistance),
    day,
    format,
    level,
  })

  const runQuickJoin = () => {
    quickJoin(buildFilters())
    setQuickJoinOpen(false)
  }

  return (
    <Dialog
      open={quickJoinOpen}
      onOpenChange={(o) => {
        if (!o) setCourtQuery("")
        setQuickJoinOpen(o)
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("quickJoin")}</DialogTitle>
          <DialogDescription>{t("quickFilter.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <FilterChips
            label={t("quickFilter.sport")}
            value={quickSport}
            onChange={onQuickSportChange}
            options={[
              { value: "all", label: t("allSports") },
              ...SPORTS.map((s) => ({
                value: s.key,
                label: tc(`sports.${s.key}`),
              })),
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              {t("quickFilter.court")}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={courtQuery}
                onChange={(e) => setCourtQuery(e.target.value)}
                placeholder={t("quickFilter.courtSearch")}
                aria-label={t("quickFilter.courtSearch")}
                className="h-9 pl-8"
              />
            </div>
            <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-border p-1">
              <button
                type="button"
                onClick={() => setQuickCourt("any")}
                className={cn(
                  "flex w-full items-center rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors",
                  quickCourt === "any"
                    ? "bg-secondary font-medium"
                    : "hover:bg-muted/60"
                )}
              >
                {t("quickFilter.anyCourt")}
              </button>
              {filteredCourts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setQuickCourt(c.id)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors",
                    quickCourt === c.id
                      ? "bg-secondary font-medium"
                      : "hover:bg-muted/60"
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    · {c.district}
                  </span>
                </button>
              ))}
              {filteredCourts.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  {t("quickFilter.noCourts")}
                </p>
              ) : null}
            </div>
          </div>
          <FilterChips
            label={t("quickFilter.distance")}
            value={maxDistance}
            onChange={setMaxDistance}
            options={[
              { value: "2", label: t("quickFilter.distance2") },
              { value: "5", label: t("quickFilter.distance5") },
              { value: "any", label: t("quickFilter.any") },
            ]}
          />
          <FilterChips
            label={t("quickFilter.when")}
            value={day}
            onChange={setDay}
            options={[
              { value: "today", label: t("quickFilter.dayToday") },
              {
                value: "today-tomorrow",
                label: t("quickFilter.dayTodayTomorrow"),
              },
            ]}
          />
          <FilterChips
            label={t("quickFilter.format")}
            value={format}
            onChange={setFormat}
            options={[
              { value: "any", label: t("quickFilter.any") },
              { value: "Singles", label: tc("format.singles") },
              { value: "Doubles", label: tc("format.doubles") },
            ]}
          />
          <FilterChips
            label={t("quickFilter.level")}
            value={level}
            onChange={setLevel}
            options={[
              { value: "my", label: t("quickFilter.myLevel") },
              { value: "any", label: t("quickFilter.any") },
              ...LEVELS.map((l) => ({
                value: l.value,
                label: tc(`levels.${l.value}`),
              })),
            ]}
          />
        </div>
        <DialogFooter>
          <Button className="rounded-full" onClick={runQuickJoin}>
            <Zap />
            {t("quickFilter.find")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Host-a-room dialog. Like Quick Join, its open-state is owned by the store so
 * the topbar can trigger it; the form state stays local and resets on close.
 */
function CreateRoomDialog() {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const tb = useTranslations("Booking")
  const locale = useLocale()
  const {
    courts: COURTS,
    user: USER,
    conflictFor,
    courtDayGaps,
    todayIso,
    bookingDays,
    dayLabelFor,
  } = useData()
  const {
    userLevelForSport,
    addRoom,
    createRoomOpen,
    setCreateRoomOpen,
    sessions,
    hostedRoomCount,
    maxHostedRooms,
    canHostMore,
  } = useMatchmaking()
  const idRef = React.useRef(0)
  const courtName = (id: string) =>
    COURTS.find((c) => c.id === id)?.name ?? t("selectCourt")

  // The schema is rebuilt every render, so its refine closes over the current
  // `sessions`/`conflictFor`; useForm re-applies it via `form.update` each
  // render, so submit-time validation always sees the latest availability.
  const createRoomSchema = z
    .object({
      title: z
        .string()
        .min(5, t("validation.titleMin"))
        .max(40, t("validation.titleMax")),
      sport: z.enum(["pickleball", "badminton"]),
      format: z.enum(["Singles", "Doubles"]),
      maxPlayers: z.number().int().min(2).max(8),
      courtId: z.string().min(1, t("validation.court")),
      day: z.string().min(1),
      startTime: z.string().min(1, t("validation.time")),
      endTime: z.string().min(1, t("validation.time")),
      level: z.enum(["beginner", "intermediate", "advanced", "any"]),
      note: z.string().max(120, t("validation.noteMax")),
    })
    .refine((d) => d.endTime > d.startTime, {
      message: t("validation.endAfterStart"),
      path: ["endTime"],
    })
    // The chosen court must actually be free for the proposed range (so a room
    // can't advertise a slot the court can't honor). Ordering is validated by
    // the refine above; skip this one until the range is sane.
    .refine(
      (d) => {
        const dur = diffMinutes(d.startTime, d.endTime)
        if (dur <= 0) return true
        return (
          conflictFor(sessions, {
            courtId: d.courtId,
            dayKey: d.day,
            slot: d.startTime,
            durationMin: dur,
          }) === null
        )
      },
      { message: t("validation.slotTaken"), path: ["startTime"] }
    )

  const form = useForm({
    defaultValues: {
      title: "",
      sport: "badminton" as SportKey,
      format: "Doubles" as "Singles" | "Doubles",
      maxPlayers: 4,
      courtId: "c1",
      day: todayIso,
      startTime: "18:30",
      endTime: "19:30",
      level: userLevelForSport("badminton") as RoomLevel,
      note: "",
    },
    validators: {
      onSubmit: createRoomSchema,
    },
    onSubmit: ({ value }) => {
      // Enforce the anti-spam cap before building the room (and keep the dialog
      // open so the user can cancel an existing room and retry).
      if (!canHostMore) {
        toast.error(t("toast.limitTitle"), {
          description: t("toast.limitBody", { max: maxHostedRooms }),
        })
        return
      }
      const court = COURTS.find((c) => c.id === value.courtId) ?? COURTS[0]
      const capacity = value.maxPlayers
      const dayLabel = locStr(dayLabelFor(value.day), locale)
      addRoom({
        id: `r-new-${idRef.current++}`,
        host: { name: USER.name, initials: USER.initials },
        title: value.title.trim(),
        sport: value.sport,
        format: value.format,
        venue: court.name,
        district: court.district,
        distanceKm: court.distanceKm,
        day: dayLabel,
        dayKey: value.day,
        time: `${value.startTime} – ${value.endTime}`,
        durationMin: diffMinutes(value.startTime, value.endTime),
        level: value.level,
        capacity,
        joined: 1,
        players: [USER.initials],
        pricePerHour: court.pricePerHour,
      })
      toast.success(t("toast.roomCreated"), {
        description: `${value.title.trim()} · ${court.name}`,
      })
      setCreateRoomOpen(false)
      form.reset()
    },
  })

  return (
    <Dialog
      open={createRoomOpen}
      onOpenChange={(o) => {
        if (!o) form.reset()
        setCreateRoomOpen(o)
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <form
          id="create-room-form"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="title">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("dialog.roomTitle")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      placeholder={t("dialog.roomTitlePlaceholder")}
                      autoComplete="off"
                    />
                    {invalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>

            <div className="grid gap-7 sm:grid-cols-2">
              <form.Field name="sport">
                {(field) => (
                  <Field>
                    <FieldLabel>{t("dialog.sport")}</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => {
                        const sport = v as SportKey
                        field.handleChange(sport)
                        form.setFieldValue("level", userLevelForSport(sport))
                        const first = COURTS.find((c) =>
                          c.sports.includes(sport)
                        )
                        if (first) form.setFieldValue("courtId", first.id)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => tc(`sports.${v as SportKey}`)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SPORTS.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {tc(`sports.${s.key}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="format">
                {(field) => (
                  <Field>
                    <FieldLabel>{t("dialog.format")}</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) =>
                        field.handleChange(v as "Singles" | "Doubles")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => tc(`format.${(v as string).toLowerCase()}`)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Singles">
                          {tc("format.singles")}
                        </SelectItem>
                        <SelectItem value="Doubles">
                          {tc("format.doubles")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Field name="maxPlayers">
              {(field) => {
                const value = field.state.value
                return (
                  <Field>
                    <FieldLabel>{t("dialog.maxPlayers")}</FieldLabel>
                    <div className="flex h-9 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="rounded-full"
                        disabled={value <= 2}
                        aria-label={t("dialog.maxPlayersDec")}
                        onClick={() =>
                          field.handleChange(Math.max(2, value - 1))
                        }
                      >
                        <Minus />
                      </Button>
                      <span className="w-6 text-center font-mono text-sm tabular-nums">
                        {value}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="rounded-full"
                        disabled={value >= 8}
                        aria-label={t("dialog.maxPlayersInc")}
                        onClick={() =>
                          field.handleChange(Math.min(8, value + 1))
                        }
                      >
                        <Plus />
                      </Button>
                    </div>
                  </Field>
                )
              }}
            </form.Field>

            <form.Subscribe selector={(s) => s.values.sport}>
              {(selectedSport) => (
                <form.Field name="courtId">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t("dialog.court")}</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => field.handleChange(v as string)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(id) => courtName(id as string)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {COURTS.filter((c) =>
                            c.sports.includes(selectedSport)
                          ).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} · {c.district}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              )}
            </form.Subscribe>

            <form.Field name="day">
              {(field) => (
                <Field>
                  <FieldLabel>{t("dialog.when")}</FieldLabel>
                  <FilterChips
                    label=""
                    value={field.state.value}
                    options={bookingDays.map((d) => ({
                      value: d.key,
                      label: locStr(d.label, locale),
                    }))}
                    onChange={(v) => field.handleChange(v)}
                  />
                </Field>
              )}
            </form.Field>

            <div className="grid gap-7 sm:grid-cols-2">
              <form.Field name="startTime">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel>{t("dialog.startTime")}</FieldLabel>
                      <Input
                        type="time"
                        min="06:00"
                        max="22:00"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid}
                      />
                      {invalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="endTime">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel>{t("dialog.endTime")}</FieldLabel>
                      <Input
                        type="time"
                        min="06:00"
                        max="23:00"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid}
                      />
                      {invalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              </form.Field>
            </div>

            <form.Subscribe
              selector={(s) => ({
                courtId: s.values.courtId,
                day: s.values.day,
                startTime: s.values.startTime,
                endTime: s.values.endTime,
              })}
            >
              {({ courtId, day, startTime, endTime }) => {
                const dur = diffMinutes(startTime, endTime)
                if (!courtId || !startTime || !endTime || dur <= 0) return null
                const conflict = conflictFor(sessions, {
                  courtId,
                  dayKey: day,
                  slot: startTime,
                  durationMin: dur,
                })
                const free = conflict
                  ? courtDayGaps(sessions, courtId, day).find(
                      (g) => g.durationMin >= dur
                    )
                  : null
                return (
                  <div
                    className={cn(
                      "flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-sm ring-1",
                      conflict
                        ? "bg-destructive/8 ring-destructive/20"
                        : "bg-brand/8 ring-brand/15"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-medium",
                        conflict ? "text-destructive" : "text-brand"
                      )}
                    >
                      {conflict ? (
                        <TriangleAlert className="size-4 shrink-0" />
                      ) : (
                        <Check className="size-4 shrink-0" />
                      )}
                      {conflict === "self-overlap"
                        ? tb("conflictSelf")
                        : conflict
                          ? tb("conflictCourt")
                          : tb("available")}
                    </span>
                    {conflict && free ? (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {tb("freeAt", { time: free.start })}
                      </span>
                    ) : null}
                  </div>
                )
              }}
            </form.Subscribe>

            <form.Field name="level">
              {(field) => {
                const levelLabel = (v: RoomLevel) =>
                  v === "any" ? tc("level.any") : tc(`levels.${v}`)
                return (
                  <Field>
                    <FieldLabel>{t("dialog.level")}</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as RoomLevel)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => (v ? levelLabel(v as RoomLevel) : "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {tc(`levels.${l.value}`)}
                          </SelectItem>
                        ))}
                        <SelectItem value="any">{tc("level.any")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="note">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("dialog.note")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupTextarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder={t("dialog.notePlaceholder")}
                        rows={3}
                        className="min-h-16 resize-none"
                        aria-invalid={invalid}
                      />
                      <InputGroupAddon align="block-end">
                        <InputGroupText className="tabular-nums">
                          {field.state.value.length}/120
                        </InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {invalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>
        </form>

        <p
          className={cn(
            "px-1 text-xs",
            canHostMore
              ? "text-muted-foreground"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {canHostMore
            ? t("dialog.roomQuota", {
                count: hostedRoomCount,
                max: maxHostedRooms,
              })
            : t("dialog.roomLimitReached", { max: maxHostedRooms })}
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("dialog.cancel")}
          </DialogClose>
          <Button type="submit" form="create-room-form" disabled={!canHostMore}>
            <Plus />
            {t("createRoom")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Persistent Match Maker dialogs (Quick Join + Create Room). Mounted in the
 * player chrome so the topbar's section actions can open them from anywhere and
 * their in-flight state survives navigation, mirroring the booking wizard.
 */
export function MatchMakerDialogs() {
  return (
    <>
      <QuickJoinDialog />
      <CreateRoomDialog />
    </>
  )
}
