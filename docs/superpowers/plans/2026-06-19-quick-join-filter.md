# Quick Join Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a popover on the Match Maker's Quick Join button that lets the player constrain the auto-pick by distance, day, format, and skill level.

**Architecture:** A new `Popover` primitive wraps the Quick Join button. Filter state lives locally in `MatchMakerView`. The provider's `quickJoin` is changed from taking a bare sport to taking a `QuickJoinFilters` object; it filters rooms through a pure `matchesQuickFilters` helper plus the (now skill-free) `isSuitable` joinable check, ranks survivors with the existing heuristic, and falls back to the fake matchmaking queue when nothing qualifies.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind v4, shadcn `base-luma` components on `@base-ui/react`, `next-intl` (en + vi), `sonner` toasts, `framer-motion`.

## Global Constraints

- **No test suite exists** (per CLAUDE.md). There is no test runner. "Verify" steps use the real project gates: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and a manual browser smoke test against the expected-behavior table in Task 5. Keep the TDD rhythm (define interface → implement → verify → commit) without unit-test files.
- **Prettier:** no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. `pnpm format` covers only `**/*.{ts,tsx}` — JSON is hand-indented (2 spaces).
- **Imports** use the `@/*` alias. Compose Tailwind classes with `cn()` from `@/lib/utils`. Put class strings in `cn`/`cva`.
- **i18n:** every user-facing string is a `next-intl` key present in **both** `messages/en.json` and `messages/vi.json`. Dashboard Vietnamese register addresses the user as "bạn" (concise), matching existing `MatchMaker` copy — NOT the landing page's "Quý khách".
- **Money/static data:** unchanged. Do not introduce `Date.now()`/random in render (mock data is intentionally static).

---

## File Structure

- **Create** `components/ui/popover.tsx` — `Popover`, `PopoverTrigger`, `PopoverContent` wrappers over `@base-ui/react/popover` (modeled on `components/ui/select.tsx`).
- **Modify** `components/dashboard/matchmaking.tsx` — add `QuickJoinFilters` type + `matchesQuickFilters` helper; reduce `isSuitable` to the joinable check; change `quickJoin` signature; thread format into `startQueue`.
- **Modify** `components/dashboard/views/match-maker.tsx` — local filter state, the Quick Join popover UI (segmented chips built from `Button` + a Find button), and the empty-state button wiring.
- **Modify** `messages/en.json` and `messages/vi.json` — add `MatchMaker.quickFilter.*`.

---

## Task 1: Add the Popover primitive

**Files:**
- Create: `components/ui/popover.tsx`

**Interfaces:**
- Produces: `Popover` (root, props `{ open?: boolean; onOpenChange?: (open: boolean) => void; children }`), `PopoverTrigger` (accepts `render={<Button .../>}`), `PopoverContent` (props include `align`, `side`, `sideOffset`, `className`, `children`).

- [ ] **Step 1: Create the component file**

Create `components/ui/popover.tsx` with this exact content (mirrors the Positioner/Popup pattern in `components/ui/select.tsx`):

```tsx
"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-72 origin-(--transform-origin) rounded-3xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none duration-100 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (no errors). If `@base-ui/react/popover` prop names differ (e.g. a Positioner prop is rejected), reconcile against `components/ui/select.tsx`, which uses the same `Positioner`/`Popup` shape and is known to compile.

- [ ] **Step 3: Verify lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ui/popover.tsx
git commit -m "feat(ui): add Popover primitive"
```

---

## Task 2: Extend the matchmaking provider with quick-join filters

This task changes `quickJoin`'s signature, which breaks its two call sites in `match-maker.tsx`. To keep the build green at commit time, this task ALSO updates those two call sites to pass a default `QuickJoinFilters` object (no popover UI yet — that is Task 4). Behavior stays ≈ today.

**Files:**
- Modify: `components/dashboard/matchmaking.tsx`
- Modify: `components/dashboard/views/match-maker.tsx` (call sites only)

**Interfaces:**
- Produces (exported from `matchmaking.tsx`):
  ```ts
  interface QuickJoinFilters {
    sport: SportKey | "all"
    maxDistanceKm: number | null      // null = no distance limit
    day: "today" | "today-tomorrow"
    format: "Singles" | "Doubles" | "any"
    level: OpenToKey                   // "my-level" | "any" | "above"
  }
  ```
  and the context method `quickJoin: (filters: QuickJoinFilters) => void`.
- Consumes: `skillWindow`, `OpenToKey` from `@/components/dashboard/data` (skillWindow already imported; add `type OpenToKey`).

- [ ] **Step 1: Import `OpenToKey` and export the filter type**

In `components/dashboard/matchmaking.tsx`, extend the data import (around lines 11–18) to include `type OpenToKey`:

```tsx
import {
  COURTS,
  ROOMS,
  USER,
  skillWindow,
  type MatchRoom,
  type OpenToKey,
  type SportKey,
} from "@/components/dashboard/data"
```

Then add the exported type just below the existing `Queue` interface (after line ~31):

```tsx
/** Constraints the Quick Join popover applies to the auto-pick. */
export interface QuickJoinFilters {
  sport: SportKey | "all"
  /** Max distance in km, or null for no limit. */
  maxDistanceKm: number | null
  day: "today" | "today-tomorrow"
  format: "Singles" | "Doubles" | "any"
  level: OpenToKey
}
```

- [ ] **Step 2: Update the context type**

In the `MatchmakingContextValue` interface, change the `quickJoin` member:

```tsx
  quickJoin: (filters: QuickJoinFilters) => void
```

- [ ] **Step 3: Reduce `isSuitable` to the joinable check**

Replace the existing `isSuitable` (lines ~102–106):

```tsx
  const isSuitable = (room: MatchRoom) =>
    USER.rating >= room.skillMin &&
    USER.rating <= room.skillMax &&
    room.joined < room.capacity &&
    !joinedIds.has(room.id)
```

with:

```tsx
  // Joinable = has an open seat and the user is not already in it. The skill
  // window check now lives in matchesQuickFilters (the Level filter).
  const isSuitable = (room: MatchRoom) =>
    room.joined < room.capacity && !joinedIds.has(room.id)

  const matchesQuickFilters = (room: MatchRoom, f: QuickJoinFilters) => {
    if (f.sport !== "all" && room.sport !== f.sport) return false
    if (f.maxDistanceKm !== null && room.distanceKm > f.maxDistanceKm)
      return false
    const day = room.day.toLowerCase()
    if (f.day === "today" && day !== "today") return false
    if (f.day === "today-tomorrow" && day !== "today" && day !== "tomorrow")
      return false
    if (f.format !== "any" && room.format !== f.format) return false
    const [min, max] = skillWindow(f.level, USER.rating)
    const mid = (room.skillMin + room.skillMax) / 2
    return mid >= min && mid <= max
  }
```

- [ ] **Step 4: Thread format into `startQueue`**

Change the `startQueue` signature and the two lines that derive capacity/format (lines ~136–146):

```tsx
  const startQueue = (
    forSport: SportKey,
    format: "Singles" | "Doubles" = "Doubles"
  ) => {
    stopTimers()
    const capacity = format === "Singles" ? 2 : 4
    setQueue({
      sport: forSport,
      format,
      capacity,
      found: 1,
      elapsed: 0,
      matched: false,
    })
```

Leave the rest of `startQueue` (the interval + seat timers) unchanged — it already reads the local `capacity`.

- [ ] **Step 5: Rewrite `quickJoin` to use filters**

Replace the existing `quickJoin` (lines ~167–185) with:

```tsx
  const quickJoin = (filters: QuickJoinFilters) => {
    const pool = rooms.filter(
      (r) => isSuitable(r) && matchesQuickFilters(r, filters)
    )
    if (pool.length) {
      const best = [...pool].sort((a, b) => {
        const am = Math.abs((a.skillMin + a.skillMax) / 2 - USER.rating)
        const bm = Math.abs((b.skillMin + b.skillMax) / 2 - USER.rating)
        if (am !== bm) return am - bm
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.joined / b.capacity - a.joined / a.capacity
      })[0]
      joinRoom(best, true)
      return
    }
    startQueue(
      filters.sport === "all" ? "badminton" : filters.sport,
      filters.format === "any" ? "Doubles" : filters.format
    )
    toast(t("toast.noRoomTitle"), {
      description: t("toast.noRoomBody"),
    })
  }
```

- [ ] **Step 6: Fix the two call sites in `match-maker.tsx` (temporary defaults)**

In `components/dashboard/views/match-maker.tsx`, both Quick Join buttons currently call `quickJoin(sport)`. Replace BOTH occurrences (line ~126 and line ~160) of:

```tsx
            onClick={() => quickJoin(sport)}
```

with:

```tsx
            onClick={() =>
              quickJoin({
                sport,
                maxDistanceKm: null,
                day: "today-tomorrow",
                format: "any",
                level: "my-level",
              })
            }
```

(These defaults are replaced by real filter state in Task 4.)

- [ ] **Step 7: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.
Run: `pnpm build`
Expected: PASS (production build completes).

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/matchmaking.tsx components/dashboard/views/match-maker.tsx
git commit -m "feat(matchmaking): quickJoin takes a filter object"
```

---

## Task 3: Add i18n strings for the Quick Join filter

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/vi.json`

**Interfaces:**
- Produces translation keys under `MatchMaker.quickFilter`: `distance`, `distance2`, `distance5`, `any`, `when`, `dayToday`, `dayTodayTomorrow`, `format`, `level`, `find`. (Format Singles/Doubles reuse `Common.format.*`; Level options reuse `MatchMaker.openTo.*`.)

- [ ] **Step 1: Add the block to `messages/en.json`**

`messages/en.json` line 433 reads `    "quickJoin": "Quick join",`. Replace that single line with (4-space indent for the key, 6-space for nested values, matching the file):

```json
    "quickJoin": "Quick join",
    "quickFilter": {
      "distance": "Within",
      "distance2": "≤2km",
      "distance5": "≤5km",
      "any": "Any",
      "when": "When",
      "dayToday": "Today",
      "dayTodayTomorrow": "Today + Tomorrow",
      "format": "Format",
      "level": "Level",
      "find": "Find match"
    },
```

- [ ] **Step 2: Add the block to `messages/vi.json`**

`messages/vi.json` line 433 reads `    "quickJoin": "Tham gia nhanh",`. Replace that single line with:

```json
    "quickJoin": "Tham gia nhanh",
    "quickFilter": {
      "distance": "Trong vòng",
      "distance2": "≤2km",
      "distance5": "≤5km",
      "any": "Tất cả",
      "when": "Thời gian",
      "dayToday": "Hôm nay",
      "dayTodayTomorrow": "Hôm nay + Ngày mai",
      "format": "Hình thức",
      "level": "Trình độ",
      "find": "Tìm trận"
    },
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "require('./messages/en.json'); require('./messages/vi.json'); console.log('json ok')"`
Expected: prints `json ok` (no parse error).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/vi.json
git commit -m "i18n: add Quick Join filter strings (en, vi)"
```

---

## Task 4: Build the Quick Join filter popover UI

**Files:**
- Modify: `components/dashboard/views/match-maker.tsx`

**Interfaces:**
- Consumes: `Popover`, `PopoverContent`, `PopoverTrigger` (Task 1); `quickJoin` + `QuickJoinFilters` (Task 2); `MatchMaker.quickFilter.*` keys (Task 3); existing `OPEN_TO`, `OpenToKey`, `Button`, `Zap`, and `useTranslations`.

- [ ] **Step 1: Update imports**

In `components/dashboard/views/match-maker.tsx`:

Add `ChevronDown` to the lucide import (line ~8):

```tsx
import {
  Check,
  ChevronDown,
  Clock,
  MapPin,
  Plus,
  Sparkles,
  Users,
  Zap,
} from "lucide-react"
```

Add the popover import (next to the other `@/components/ui` imports, e.g. after the `Select` import group):

```tsx
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
```

Add the `QuickJoinFilters` type to the existing matchmaking import (line ~56):

```tsx
import {
  useMatchmaking,
  type QuickJoinFilters,
} from "@/components/dashboard/matchmaking"
```

- [ ] **Step 2: Add the `FilterChips` helper component**

Add this near the top of the module (e.g. just above `export function MatchMakerView()`):

```tsx
/** One row of single-select segmented chips built from Button. */
function FilterChips({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
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
```

- [ ] **Step 3: Add filter state + helpers inside `MatchMakerView`**

Just after the existing `const [createOpen, setCreateOpen] = React.useState(false)` (line ~78), add:

```tsx
  const [quickOpen, setQuickOpen] = React.useState(false)
  const [maxDistance, setMaxDistance] = React.useState("any") // "2" | "5" | "any"
  const [day, setDay] = React.useState("today-tomorrow") // "today" | "today-tomorrow"
  const [format, setFormat] = React.useState("any") // "any" | "Singles" | "Doubles"
  const [level, setLevel] = React.useState<OpenToKey>("my-level")

  const buildFilters = (): QuickJoinFilters => ({
    sport,
    maxDistanceKm: maxDistance === "any" ? null : Number(maxDistance),
    day: day as QuickJoinFilters["day"],
    format: format as QuickJoinFilters["format"],
    level,
  })

  const runQuickJoin = () => {
    quickJoin(buildFilters())
    setQuickOpen(false)
  }
```

- [ ] **Step 4: Replace the main Quick Join button with the popover**

In the "Filter + actions" block, replace the existing Quick Join `<Button>` (the one wrapping `<Zap />` + `{t("quickJoin")}`, lines ~123–130):

```tsx
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => quickJoin(sport)}
          >
            <Zap />
            {t("quickJoin")}
          </Button>
```

(after Task 2 its `onClick` is the temporary defaults object) with:

```tsx
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
                  onChange={(v) => setLevel(v as OpenToKey)}
                  options={OPEN_TO.map((o) => ({
                    value: o.value,
                    label: t(`openTo.${o.value}`),
                  }))}
                />
                <Button className="rounded-full" onClick={runQuickJoin}>
                  <Zap />
                  {t("quickFilter.find")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
```

- [ ] **Step 5: Wire the empty-state button to the filter state**

In the empty-state block, replace the temporary-defaults `onClick` on the "Find me a match" button (line ~157–164 region) with:

```tsx
              onClick={() => quickJoin(buildFilters())}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/views/match-maker.tsx
git commit -m "feat(match-maker): Quick Join filter popover"
```

---

## Task 5: Full verification and manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Format, typecheck, lint, build**

Run: `pnpm format && pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS; `git diff --stat` after format shows only whitespace churn (if any) in the touched `.tsx` files.

- [ ] **Step 2: Manual smoke test**

Start the dev server (`pnpm dev`) and open the dashboard Match Maker page. Use a browser (or the `agent-browser` / `verify` skill). With a **fresh page load** (`USER.rating = 4.12`, no rooms joined), confirm each case below by opening the Quick Join popover, setting the filters, and pressing **Find match**:

| Filters (sport tab · Within · When · Format · Level) | Expected outcome |
| --- | --- |
| All · Any · Today + Tomorrow · Any · My level (defaults) | Joins **r1** "Evening badminton, friendly doubles" (toast "Quick joined a room") |
| All · ≤2km · Today + Tomorrow · Any · My level | Joins **r1** (r2/r4/r6 are >2km) |
| All · Any · Any · Singles · My level | Joins **r2** "Competitive tennis singles" |
| All · Any · Any · Any · Stronger | Joins **r6** "Tennis doubles, all welcome" |
| Tennis tab · Any · Today · Doubles · My level | **No room qualifies** → fake matchmaking queue starts (dock appears, "No open room fits" toast); dock shows Doubles / 4 seats |

Also confirm:
- The room **grid is unchanged** by any filter setting (filters affect only the auto-pick).
- Switching the **sport tab** still scopes both the grid and what Quick Join considers.
- After a quick-join, the **Active Room pill** appears in the topbar (existing behavior, regression check).
- Toggle locale to **vi** (locale switcher) and reopen the popover — all four rows + Find button show Vietnamese labels.

- [ ] **Step 3: Final commit (only if Step 1 produced formatting changes)**

```bash
git add -A
git commit -m "chore: format Quick Join filter changes"
```

---

## Self-Review

- **Spec coverage:** popover-with-Find (Task 4) ✓; four filters with documented defaults (Tasks 3–4) ✓; selection logic incl. midpoint Level semantics + ranking (Task 2) ✓; queue fallback with chosen sport/format (Task 2) ✓; `isSuitable` reduced, `matchesQuickFilters` added (Task 2) ✓; popover primitive added (Task 1) ✓; en + vi strings (Task 3) ✓; grid untouched, empty-state wired (Tasks 4–5) ✓; out-of-scope items (persistence, price, slider, multi-sport) not implemented ✓.
- **Placeholders:** none — every code step shows full content.
- **Type consistency:** `QuickJoinFilters` field names (`sport`, `maxDistanceKm`, `day`, `format`, `level`) are identical across Task 2 (definition), Task 2 Step 6 (temporary call sites), and Task 4 (`buildFilters`). `quickJoin(filters)` signature matches all call sites. `OpenToKey` imported where used. Day/format string unions match between state casts and the type.
