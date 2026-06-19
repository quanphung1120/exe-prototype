"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as z from "zod"
import {
  Check,
  ChevronDown,
  Clock,
  LogOut,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Users,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LevelChip, SportTag } from "@/components/dashboard/shared"
import {
  COURTS,
  LEVELS,
  ROOM_TIME_SLOTS,
  SPORTS,
  USER,
  formatVnd,
  type MatchRoom,
  type RoomLevel,
  type SportKey,
} from "@/components/dashboard/data"
import {
  useMatchmaking,
  type QuickJoinFilters,
} from "@/components/dashboard/matchmaking"

/** Map a stored English day word ("Today"/"Tomorrow") to a localized label. */
function roomDayLabel(day: string, tc: (key: string) => string) {
  const key = day.toLowerCase()
  if (key === "today" || key === "tomorrow" || key === "yesterday") {
    return tc(`when.${key}`)
  }
  return day
}

/** Localize a stored time-slot string by looking up its index in ROOM_TIME_SLOTS. */
function timeSlotLabel(slot: string, t: (key: string) => string) {
  const i = ROOM_TIME_SLOTS.indexOf(slot)
  return i >= 0 ? t(`timeSlots.${i}`) : slot
}

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

export function MatchMakerView() {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const {
    rooms,
    joinedIds,
    userLevel,
    joinRoom,
    leaveRoom,
    quickJoin,
    addRoom,
  } = useMatchmaking()
  const [sport, setSport] = React.useState<SportKey | "all">("all")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [quickOpen, setQuickOpen] = React.useState(false)
  const [maxDistance, setMaxDistance] = React.useState("any") // "2" | "5" | "any"
  const [day, setDay] =
    React.useState<QuickJoinFilters["day"]>("today-tomorrow")
  const [format, setFormat] = React.useState<QuickJoinFilters["format"]>("any")
  const [level, setLevel] = React.useState<QuickJoinFilters["level"]>("my")

  const buildFilters = (): QuickJoinFilters => ({
    sport,
    maxDistanceKm: maxDistance === "any" ? null : Number(maxDistance),
    day,
    format,
    level,
  })

  const runQuickJoin = () => {
    quickJoin(buildFilters())
    setQuickOpen(false)
  }

  const visibleRooms = rooms.filter((r) => sport === "all" || r.sport === sport)

  return (
    <div className="flex flex-col gap-5">
      {/* AI rationale */}
      <div className="relative overflow-hidden rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div className="absolute -top-12 -right-10 size-40 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold">
              {t("heroTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t.rich("heroBody", {
                level: tc(`levels.${userLevel}`),
                strong: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Filter + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={sport}
          onValueChange={(v) => setSport(v as SportKey | "all")}
        >
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="all">{t("allSports")}</TabsTrigger>
            {SPORTS.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {tc(`sports.${s.key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={quickOpen} onOpenChange={setQuickOpen}>
            <PopoverTrigger
              render={
                <Button variant="outline" className="rounded-full">
                  <Zap />
                  {t("quickJoin")}
                  <ChevronDown className="text-muted-foreground" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-72">
              <div className="flex flex-col gap-4">
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
                <Button className="rounded-full" onClick={runQuickJoin}>
                  <Zap />
                  {t("quickFilter.find")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("createRoom")}
          </Button>
        </div>
      </div>

      {/* Room grid */}
      {visibleRooms.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              joined={joinedIds.has(room.id)}
              onJoin={() => joinRoom(room)}
              onLeave={() => leaveRoom(room.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-4xl bg-card px-4 py-14 text-center shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Zap className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">{t("emptyRooms")}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => quickJoin(buildFilters())}
            >
              <Zap />
              {t("findMatch")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              {t("hostOne")}
            </Button>
          </div>
        </div>
      )}

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={addRoom}
      />
    </div>
  )
}

function RoomCard({
  room,
  joined,
  onJoin,
  onLeave,
}: {
  room: MatchRoom
  joined: boolean
  onJoin: () => void
  onLeave: () => void
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const [leaveHint, setLeaveHint] = React.useState(false)
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined
  const title = t.has(`rooms.${room.id}.title`)
    ? t(`rooms.${room.id}.title`)
    : room.title
  const day = roomDayLabel(room.day, tc)

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg dark:ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SportTag sport={room.sport} />
            <span className="text-xs text-muted-foreground">
              · {tc(`format.${room.format.toLowerCase()}`)}
            </span>
          </div>
          <p className="mt-1 truncate font-heading text-lg leading-tight font-semibold">
            {title}
          </p>
        </div>
        <LevelChip level={room.level} className="shrink-0" />
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {room.venue} · {room.district} · {room.distanceKm} km
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {day} · {room.time}
          </span>
        </span>
      </div>

      {/* Fill meter */}
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-muted/50 p-2.5">
        <div className="flex items-center gap-2">
          <AvatarGroup>
            {room.players.map((p, i) => (
              <Avatar key={i} className="size-7">
                <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
                  {p}
                </AvatarFallback>
              </Avatar>
            ))}
            {Array.from({ length: openSeats }).map((_, i) => (
              <span
                key={`seat-${i}`}
                className="grid size-7 place-items-center rounded-full border border-dashed border-border bg-background text-muted-foreground ring-2 ring-background"
              >
                <Users className="size-3" />
              </span>
            ))}
          </AvatarGroup>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {room.joined}/{room.capacity}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">/h</span>
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t("hostedBy", { name: room.host.name })}
          {!joined && !full ? ` · ${t("openSeats", { count: openSeats })}` : ""}
        </span>
        {joined ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "ml-auto shrink-0 rounded-full",
              leaveHint && "bg-destructive/10 text-destructive"
            )}
          >
            {leaveHint ? (
              <>
                <LogOut />
                {t("leave")}
              </>
            ) : (
              <>
                <Check />
                {t("joined")}
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            className="ml-auto shrink-0 rounded-full"
            variant={full ? "outline" : "default"}
            disabled={full}
            onClick={onJoin}
          >
            {full ? t("full") : t("join")}
          </Button>
        )}
      </div>
    </div>
  )
}

function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (room: MatchRoom) => void
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const { userLevel } = useMatchmaking()
  const idRef = React.useRef(0)
  const courtName = (id: string) =>
    COURTS.find((c) => c.id === id)?.name ?? t("selectCourt")

  const createRoomSchema = z.object({
    title: z
      .string()
      .min(5, t("validation.titleMin"))
      .max(40, t("validation.titleMax")),
    sport: z.enum(["tennis", "pickleball", "badminton"]),
    format: z.enum(["Singles", "Doubles"]),
    maxPlayers: z.number().int().min(2).max(8),
    courtId: z.string().min(1, t("validation.court")),
    time: z.string().min(1, t("validation.time")),
    level: z.enum(["beginner", "intermediate", "advanced", "any"]),
    note: z.string().max(120, t("validation.noteMax")),
  })

  const form = useForm({
    defaultValues: {
      title: "",
      sport: "badminton" as SportKey,
      format: "Doubles" as "Singles" | "Doubles",
      maxPlayers: 4,
      courtId: "c1",
      time: ROOM_TIME_SLOTS[0],
      level: userLevel as RoomLevel,
      note: "",
    },
    validators: {
      onSubmit: createRoomSchema,
    },
    onSubmit: async ({ value }) => {
      const court = COURTS.find((c) => c.id === value.courtId) ?? COURTS[0]
      const capacity = value.maxPlayers
      const [day, ...rest] = value.time.split(" ")
      onCreate({
        id: `r-new-${idRef.current++}`,
        host: { name: USER.name, initials: USER.initials },
        title: value.title.trim(),
        sport: value.sport,
        format: value.format,
        venue: court.name,
        district: court.district,
        distanceKm: court.distanceKm,
        day,
        time: rest.join(" "),
        level: value.level,
        capacity,
        joined: 1,
        players: [USER.initials],
        pricePerHour: court.pricePerHour,
      })
      toast.success(t("toast.roomCreated"), {
        description: `${value.title.trim()} · ${court.name}`,
      })
      onOpenChange(false)
      form.reset()
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset()
        onOpenChange(o)
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
            form.handleSubmit()
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
                        field.handleChange(v as SportKey)
                        const first = COURTS.find((c) =>
                          c.sports.includes(v as SportKey)
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

            <div className="grid gap-7 sm:grid-cols-2">
              <form.Field name="time">
                {(field) => (
                  <Field>
                    <FieldLabel>{t("dialog.when")}</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => timeSlotLabel(v as string, t)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_TIME_SLOTS.map((slot, i) => (
                          <SelectItem key={slot} value={slot}>
                            {t(`timeSlots.${i}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="level">
                {(field) => {
                  const levelLabel = (v: RoomLevel) =>
                    v === "any" ? tc("level.any") : tc(`levels.${v}`)
                  return (
                    <Field>
                      <FieldLabel>{t("dialog.level")}</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) =>
                          field.handleChange(v as RoomLevel)
                        }
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
            </div>

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

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("dialog.cancel")}
          </DialogClose>
          <Button type="submit" form="create-room-form">
            <Plus />
            {t("createRoom")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
