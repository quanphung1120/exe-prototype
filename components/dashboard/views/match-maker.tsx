"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import * as z from "zod"
import { Check, Clock, MapPin, Plus, Sparkles, Users, Zap } from "lucide-react"

import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SportTag } from "@/components/dashboard/shared"
import {
  COURTS,
  OPEN_TO,
  ROOM_TIME_SLOTS,
  SPORTS,
  USER,
  formatVnd,
  skillWindow,
  sportLabel,
  type MatchRoom,
  type OpenToKey,
  type SportKey,
} from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"

export function MatchMakerView() {
  const { rooms, joinedIds, joinRoom, quickJoin, addRoom } = useMatchmaking()
  const [sport, setSport] = React.useState<SportKey | "all">("all")
  const [createOpen, setCreateOpen] = React.useState(false)

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
              Open rooms near your level
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Lobbies around your{" "}
              <span className="font-medium text-foreground">
                {USER.rating.toFixed(2)}
              </span>{" "}
              rating. <span className="font-medium text-foreground">Quick Join</span>{" "}
              drops you into the best fit — or queues you for a fresh match when
              nothing fits.
            </p>
          </div>
        </div>
      </div>

      {/* Filter + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={sport} onValueChange={(v) => setSport(v as SportKey | "all")}>
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="all">All sports</TabsTrigger>
            {SPORTS.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => quickJoin(sport)}
          >
            <Zap />
            Quick join
          </Button>
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus />
            Create room
          </Button>
        </div>
      </div>

      {/* Room grid */}
      {visibleRooms.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              joined={joinedIds.has(room.id)}
              onJoin={() => joinRoom(room)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-4xl bg-card px-4 py-14 text-center shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Zap className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            No open rooms for this sport yet.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => quickJoin(sport)}
            >
              <Zap />
              Find me a match
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              Host one
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
}: {
  room: MatchRoom
  joined: boolean
  onJoin: () => void
}) {
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg dark:ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SportTag sport={room.sport} />
            <span className="text-xs text-muted-foreground">· {room.format}</span>
          </div>
          <p className="mt-1 truncate font-heading text-lg leading-tight font-semibold">
            {room.title}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono tabular-nums">
          {room.skillMin.toFixed(1)}–{room.skillMax.toFixed(1)}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {room.venue} · {room.district} · {room.distanceKm} km
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          {room.day} · {room.time}
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
        <span className="truncate text-xs text-muted-foreground">
          Hosted by {room.host.name}
          {!joined && !full ? ` · ${openSeats} open` : ""}
        </span>
        <Button
          size="sm"
          className="ml-auto shrink-0 rounded-full"
          variant={joined ? "secondary" : full ? "outline" : "default"}
          disabled={joined || full}
          onClick={onJoin}
        >
          {joined ? (
            <>
              <Check />
              Joined
            </>
          ) : full ? (
            "Full"
          ) : (
            "Join"
          )}
        </Button>
      </div>
    </div>
  )
}

const createRoomSchema = z.object({
  title: z
    .string()
    .min(5, "Give your room a title of at least 5 characters.")
    .max(40, "Keep the title under 40 characters."),
  sport: z.enum(["tennis", "padel", "pickleball", "badminton", "squash"]),
  format: z.enum(["Singles", "Doubles"]),
  courtId: z.string().min(1, "Pick a court."),
  time: z.string().min(1, "Pick a time."),
  openTo: z.enum(["my-level", "any", "above"]),
  note: z.string().max(120, "Keep your note under 120 characters."),
})

function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (room: MatchRoom) => void
}) {
  const idRef = React.useRef(0)
  const courtName = (id: string) =>
    COURTS.find((c) => c.id === id)?.name ?? "Select a court"

  const form = useForm({
    defaultValues: {
      title: "",
      sport: "padel" as SportKey,
      format: "Doubles" as "Singles" | "Doubles",
      courtId: "c1",
      time: ROOM_TIME_SLOTS[0],
      openTo: "my-level" as OpenToKey,
      note: "",
    },
    validators: {
      onSubmit: createRoomSchema,
    },
    onSubmit: async ({ value }) => {
      const court = COURTS.find((c) => c.id === value.courtId) ?? COURTS[0]
      const [skillMin, skillMax] = skillWindow(value.openTo, USER.rating)
      const capacity = value.format === "Doubles" ? 4 : 2
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
        skillMin,
        skillMax,
        capacity,
        joined: 1,
        players: [USER.initials],
        pricePerHour: court.pricePerHour,
      })
      toast.success("Room created", {
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
          <DialogTitle>Host a room</DialogTitle>
          <DialogDescription>
            Set up a lobby and we&apos;ll surface it to players near your level.
          </DialogDescription>
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
                    <FieldLabel htmlFor={field.name}>Room title</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      placeholder="Evening padel, friendly doubles"
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
                    <FieldLabel>Sport</FieldLabel>
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
                          {(v) => sportLabel(v as SportKey)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SPORTS.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
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
                    <FieldLabel>Format</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) =>
                        field.handleChange(v as "Singles" | "Doubles")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{(v) => v as string}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Singles">Singles</SelectItem>
                        <SelectItem value="Doubles">Doubles</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Subscribe selector={(s) => s.values.sport}>
              {(selectedSport) => (
                <form.Field name="courtId">
                  {(field) => (
                    <Field>
                      <FieldLabel>Court</FieldLabel>
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
                    <FieldLabel>When</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{(v) => v as string}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_TIME_SLOTS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="openTo">
                {(field) => (
                  <Field>
                    <FieldLabel>Open to</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as OpenToKey)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) =>
                            OPEN_TO.find((o) => o.value === v)?.label ?? ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {OPEN_TO.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Field name="note">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Note for players (optional)
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupTextarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Bring your own paddle. We'll grab the court 10 min early."
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
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="create-room-form">
            <Plus />
            Create room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
