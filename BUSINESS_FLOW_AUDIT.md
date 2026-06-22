# Business Flow Validation & Conflict Audit — SportMatch AI

> Generated 2026-06-22. Read-only analysis of every business flow across `apps/web`,
> `apps/api`, and `packages/shared`. This prototype has **no database** — most state
> is hardcoded seed data, the player side is a client-side store, and the venue side
> is an in-memory API store. The conflicts below are real **relative to the app's own
> stated model** (see `CLAUDE.md` and the type docs); severity is judged for "if this
> were taken toward production," with prototype context noted where relevant.
>
> **Update 2026-06-22 — fixes applied.** Every 🔴 Critical, the top 🟠 High (H5), and
> the one outright-dead control in M5 have been fixed in code; build/typecheck/lint are
> green. Each resolved finding is tagged **✅ RESOLVED** below with what changed. The
> remaining 🟠/🟡/⚪ items are *source-of-truth / architectural decisions* (e.g. "is each
> surface live or a marketing snapshot?", "do player and operator share one court
> model?") that require a deliberate product call before a large rewrite — they are
> tagged **🟡 DEFERRED (by decision)** with rationale, not silently dropped. See the
> **Resolution status** section for the summary.

## How to read this

Each finding lists the **flows in conflict**, **what actually happens**, **evidence**
(`file:line`), and a **repro** where one exists. Severity:

- 🔴 **Critical** — breaks a flow under default config, or silently corrupts an invariant.
- 🟠 **High** — two flows present contradictory truths the user will hit normally.
- 🟡 **Medium** — desync / missing guard that bites in plausible sequences.
- ⚪ **Low / By-design** — latent or intentional tension worth recording.

---

## Resolution status (2026-06-22)

**Fixed in code (✅):**

| Finding | Fix |
| --- | --- |
| **C1** — CRUD posts to wrong port | `lib/api.ts` now **exports** the single `API_URL` (default `:6969`); `lib/venue-actions.ts` imports it instead of hardcoding `:8080`. Reads and writes can no longer drift. `CLAUDE.md` port refs corrected `:3001`→`:6969`. |
| **C2** — empty-venue dashboards crash | `emptyOps` (`apps/api/src/data/venue.ts`) now returns **structurally-valid, zeroed** `revenueSeries`/`channelMix`/`peakHours` (and a `sportMix` derived from the venue's courts) so the dashboards render an honest "no activity" state instead of indexing into `[]`. Belt-and-suspenders guards added at the index/divide sites (`command`, `analytics`, `customers`, `venue-copilot`). The utilization heatmap is now a **per-venue** `utilizationHeatmap(seed)` (was a module constant showing the flagship's pattern for every venue) and renders **zeroed** for a no-activity venue. |
| **C4** — auto-approval bypasses capacity | `scheduleHostApproval` (`session.tsx`) now re-checks `activeRoster >= capacity` at approval time, mirroring `approveRequest`; if the room filled first it drops the request (no over-capacity seat, no stuck "requested" pill) and toasts "full". |
| **H5** — "joined" before approval | `requestJoin` no longer adds the room to `joinedIds`; membership (and the team chat / notification / active-room pill derived from it) is granted **only** in `scheduleHostApproval` once approved. The "requested" state still surfaces via `requestedIds`. `joinRoom` guards against duplicate requests. |
| **M5** (partial) — dead "Check in" button | The Command Center "Check in" button now has an `onClick` (local optimistic check-in + toast), consistent with the other local-only operator actions. |

**Deferred by decision (🟡) — recorded, not fixed:** **C3** (player/operator are disjoint
court/availability models) and **H1–H4, H… , M1–M8, L1–L5** that are "two surfaces show
different truths" are *prototype-scope source-of-truth decisions*: fixing them means picking
one authority (live store vs. seed snapshot) or unifying the two universes — a deliberate
product/architecture call and, for C3, a large rewrite. They are left intact with the
rationale on each finding. The crash/invariant bugs that could break a demo out of the box
are all resolved above.

---

## Business flows inventory (what was validated)

**Player surface** (`/dashboard`, state in `components/dashboard/session.tsx`):
1. **Book a court** (court-first wizard: court → slot → players → confirm → fake-pay).
2. **Quick Match / Quick Join** (auto-pick a room or fake-search a partner).
3. **Host a room** (Create Room dialog → forming session listed in Match Maker).
4. **Join a room** (send request → host approval → confirmed seat).
5. **Manage active room** (invite/kick, set capacity, book a court for the room, leave/disband).
6. **Bookings** (calendar + history: cancel, add-team, rebook).
7. **Find courts**, **Overview**, **Streak**, **Chat**, **Notifications**, **AI Court Assistant**.

**Operator surface** (`/dashboard/venue`, KPI state in `venue/venue-provider.tsx`):
8. **Command Center** (live KPIs + "courts now").
9. **Schedule** (calendar grid) + **Reservations** (approve/decline).
10. **Insights/Analytics** + **AI adaptive pricing** (apply/dismiss price moves).
11. **Customers** (CRM, win-back).
12. **Manage** (venue/court CRUD + active-venue switch) — the only durable mutations.
13. **AI Copilot** (faked planner).

**Data plane:** Hono API (`apps/api`) serves a one-shot `/api/seed`; web fetches it
server-side in the dashboard layout → `DataProvider` → `useData()`. Venue CRUD goes
through server actions (`lib/venue-actions.ts`) → API in-memory store.

---

# 🔴 Critical

## C1 — Venue/court CRUD targets the wrong port; the entire operator management flow is broken out of the box
**✅ RESOLVED** — `lib/api.ts` exports a single `API_URL` (default `:6969`); `lib/venue-actions.ts` imports it instead of defaulting to `:8080`. `CLAUDE.md` corrected `:3001`→`:6969`.

**Flows:** Manage venue/courts (12) ↔ API data plane.

The API binds to **6969**; the seed-read path uses 6969; but **all operator CRUD
mutations post to 8080**, and there is no `.env` and `turbo.json` only passes through
`PORT`/`NODE_ENV` (not `API_URL`). The mobile port correctly uses 6969, confirming
8080 is a stray default.

- `apps/api/src/index.ts:44` — `const port = Number(process.env.PORT ?? 6969)`
- `apps/web/lib/api.ts:7` — seed reads `?? "http://localhost:6969"` ✅
- `apps/web/lib/venue-actions.ts:13` — `?? "http://localhost:8080"` ❌
- `apps/mobile/src/lib/api.ts:6` — `API_PORT = 6969` (the intended port)

**Effect:** `createVenue` / `updateVenue` / `deleteVenue` / `addCourt` / `updateCourt`
/ `deleteCourt` all `fetch("http://localhost:8080/...")` → connection refused → the
`try/catch` in `manage.tsx` shows an error toast. Reads work, so the app *looks* fine
until you try to mutate. **Switching** the active venue still works because
`setActiveVenue` only writes a cookie (no fetch, `venue-actions.ts:118`) — which is
what exposes C2 below.

**Repro:** Open `/dashboard/venue/manage`, add a court or create a venue → error toast,
nothing persists.

**Also documentation drift:** `CLAUDE.md` says the API runs on **:3001**; it actually
runs on **:6969**. Three different numbers across docs/read/write.

---

## C2 — Switching the active venue to any non-flagship venue crashes the operator dashboards
**✅ RESOLVED** — `emptyOps` now returns zeroed-but-valid `revenueSeries`/`channelMix`/`peakHours` (+ a courts-derived `sportMix`); the indexing/division sites in `command`/`analytics`/`customers`/`venue-copilot` are additionally guarded; the heatmap is now per-venue (`utilizationHeatmap(seed)`) and zeroed for no-activity venues.

**Flows:** Multi-venue switch (12) ↔ Command Center (8) / AI Copilot (13) / Insights-Analytics (10) / Customers (11).

Only the flagship `v1` ("Shuttle Republic") has operator data. `v2`/`v3` and any
created venue ship with `emptyOps([])` — empty `reservations / customers / revenueSeries
/ sportMix / channelMix / peakHours / insights` (`apps/api/src/data/venue.ts:708-740`).
Multiple operator views index into those arrays without a length guard:

- **Command Center crashes:** `command.tsx:63-64` — `todayIdx = REVENUE_SERIES.length - 1`; `REVENUE_SERIES[todayIdx].value` → `REVENUE_SERIES[-1].value` → **TypeError**.
- **AI Copilot crashes** (mounted on every venue via the venue layout): `venue-copilot.tsx:146` `REVENUE_SERIES[length-1].value`, `:211` `PEAK_HOURS[0]` (then `.hour`).
- **Insights/Analytics crashes:** `analytics.tsx:332` `CHANNEL_MIX[0].pct` → `undefined.pct` → **TypeError**; `analytics.tsx:182` `revLabels[revValues.indexOf(Math.max(...revValues))]` → `Math.max()` of `[]` = `-Infinity` → `indexOf` = `-1` → `revLabels[-1]` = `undefined` peak-day label.
- **Customers NaN:** `customers.tsx:52-53` `vipCount/total` with `total = 0` → `NaN%` in the VIP-share tile.
- The utilization heatmap is a **module-level constant** (`helpers.ts:777-786`), so empty venues even show the *flagship's* heatmap.

**Repro:** Sidebar venue switcher → pick "Smash Arena" (v2) → Command Center / Copilot
throw; Insights shows NaN / undefined.

> The multi-venue management flow and the operator-dashboard flows were clearly built
> against different assumptions: management says "you can run several venues, new ones
> start empty," dashboards say "a venue always has flagship-shaped data."

---

## C3 — The player booking universe and the venue operator universe are completely disjoint models of the same real world
**🟡 DEFERRED (by decision)** — This is the prototype's deepest architectural shortcut, not a bug to patch: the player (`c*` ids) and operator (`vc*` ids) sides use different id namespaces, different seed lists, and two independent availability hashes. Unifying them into one shared court/availability model is a deliberate, large rewrite that should be decided before either side is taken toward production — recorded here, intentionally left intact.

**Flows:** Player booking/availability (1,2,6) ↔ Operator schedule/reservations (9). **This is the central hidden conflict.**

The same real venues and players exist in **both** datasets, independently and
inconsistently:

- "Shuttle Republic" is a **player court** `c1` (`data/player.ts:108`, badminton only,
  360K) **and** the operator's flagship **venue** `v1` (`data/venue.ts:24`, badminton +
  pickleball, courts `vc1..vc6`). Same name, two unrelated records.
- The same people (TH, LL, PQ, VH…) are player `MATCH_SUGGESTIONS`, operator
  `RESERVATIONS` customers, and `VENUE_CUSTOMERS` — three separate hand-authored lists.

Availability is generated by **two different deterministic hash functions over two
different id namespaces** that never consult each other:

- Player side: `courtSlots` / `courtDayBusy` / `conflictFor` hash over **`c*` ids** and
  honor real `PlaySession` court holds (`helpers.ts:213-310`).
- Operator side: `courtDayEvents` / `courtDaySlots` hash over **`vc*` ids** and ignore
  all bookings/reservations entirely (`helpers.ts:661-764`).

**Effect:**
- A player's confirmed booking **never** appears on the operator's schedule or
  reservations, and vice versa.
- The same court/time can read **"free" to the player and "booked" to the operator**
  simultaneously (different hashes), or vice versa.
- Catalog mismatch for the "same" venue: a player **cannot** book pickleball at
  "Shuttle Republic" (`c1.sports = ["badminton"]`) even though operator `v1` runs
  pickleball courts `vc5/vc6`. "Smash Pickleball" (player `c3`, pickleball+badminton)
  vs "Smash Arena" (operator `v2`, badminton+tennis) — different sports under
  near-identical names.

This is acceptable as a demo shortcut, but it is the deepest conflict: the two halves
of the product do not share a court/availability model, so nothing the player does is
ever visible to the operator they're booking from.

---

## C4 — Faked host auto-approval bypasses the capacity guard that manual approval enforces
**✅ RESOLVED** — `scheduleHostApproval` now re-checks `activeRoster(s).length >= s.capacity` at approval time (mirroring `approveRequest`); if the room filled in the interim it drops the request and toasts "full" instead of confirming an over-capacity seat.

**Flows:** Join-a-room request (4) ↔ room capacity invariant.

When the **user** requests to join, a timer auto-approves them after `APPROVE_MS`
**without re-checking capacity**:

- `scheduleHostApproval` (`session.tsx:430-458`) only checks `status !== "cancelled"`
  and `me.rsvp === "requested"`, then flips `requested → going`. **No capacity check.**
- The manual host path **does** guard: `approveRequest` (`session.tsx:499-527`) returns
  early / toasts "full" when `activeRoster(x).length >= x.capacity`.

So if the room fills between the request and the timer firing, the user's seat is
auto-confirmed **over capacity**, violating the invariant every other path protects.
The initial `requestJoin` guard (`session.tsx:466`) checks capacity only at request
time, not at approval time.

> Inconsistent enforcement of the same rule across two code paths for the same action
> is the classic "hidden conflict between flows."

---

# 🟠 High

## H1 — Overview (and Streak/Activity) read frozen seed data while Bookings/Match Maker are live — the two contradict after any action
**🟡 DEFERRED (by decision)** — "Is Overview/Streak a live projection or a marketing snapshot?" is a product call. Making Overview read the live session store (and Streak react to play) is a worthwhile follow-up, but it's a deliberate surface-by-surface decision rather than a crash/invariant bug.

**Flows:** Overview/Streak (7) ↔ Bookings/booking/matchmaking (1,2,6).

`useData()` exposes the **immutable seed** `bookings`/`streak`/`activity`/`players`;
`useSession()` exposes the **live** projection. They are different arrays.

- Overview "next match": `overview.tsx:76` `BOOKINGS.find((b)=>b.status==="confirmed")!`
  reads seed `b1` and **never updates**. Cancel `b1` in Bookings (live store flips it to
  `cancelled`, `session.tsx:1273-1299`) and Overview still shows it as your next match.
- Overview's Match Maker preview lists seed `MATCH_SUGGESTIONS` (`overview.tsx:77-79`),
  not `useMatchmaking().rooms` — its "See all" jumps to `/dashboard/play` which shows the
  *actual* rooms. Two data sets under one heading.
- Streak/heatmap/milestones are 100% static (`streak.tsx:22-33,37`); completing or
  booking games changes nothing. Milestone `unlocked` flags are literals unrelated to
  `STREAK.current` (a 14-day milestone can show unlocked at a 6-day streak).
- Note `overview.tsx:76` uses a non-null assertion (`!`) with no fallback — safe only
  because the seed always contains a confirmed booking.

## H2 — Operator Schedule grid and Reservations list are two unrelated sources presented as "two views of the same thing"
**🟡 DEFERRED (by decision)** — Reconciling the hash-fabricated grid with the hardcoded `RESERVATIONS` requires one source of truth for occupancy (and is entangled with C3). Recorded for the data-model decision, not patched.

**Flows:** Schedule grid (9) ↔ Reservations (9), inside the same Schedule workspace.

`schedule-workspace.tsx` frames the calendar and the reservations table as one surface,
but the calendar comes from `courtDayEvents` (hash + fabricated `SCHED_NAMES`,
`helpers.ts:661-722`) and the table comes from the hardcoded `RESERVATIONS`
(`data/venue.ts:117-258`). They are unrelated.

- Concrete contradiction: `rv5` is **checked-in** on **Court 1, Today 18:00–19:30,
  Phạm Quân** (`venue.ts:174-187`). The Court 1 (`vc1`) calendar column is generated
  from `hashStr("vc1:today:…")` and shows different fabricated blocks at 18:00 — no
  Phạm Quân. Pending `rv1/rv2` aren't on the grid at all, yet the grid may already show
  those slots "booked" by a made-up name.
- `bookingsToday = 34` (seed KPI) ≠ the ~5 today reservations ≠ the count of generated
  grid events.

## H3 — "Who is on the court right now" has three independent, conflicting answers
**🟡 DEFERRED (by decision)** — Same root as H2/C3: three fabricated occupancy sources need to collapse to one. A data-model decision, not a localized fix.

**Flows:** Command Center (8) ↔ Schedule (9) ↔ Reservations (9).

- Command hero reads each court's **static** `occupant`/`until` (e.g. `vc1` = "Badminton
  Crew" until 19:30, `venue.ts:44-50`).
- Schedule grid invents occupants from `SCHED_NAMES` (`helpers.ts:624-635,714`).
- Reservations put *different* people on the same courts (`rv5` Phạm Quân on Court 1).

All three render for "Today" and disagree. Worse, `updateCourt` can never reconcile
them: it patches only name/sport/surface/price/state (`venue-store.ts:154-168`) — never
`occupant`/`until`/`utilToday`. So setting a court "in-play" via Manage shows it live
**with no occupant**, and "Badminton Crew"/"86%" can only be removed by deleting the court.

## H4 — AI adaptive-pricing "Apply" never changes a price; it only nudges one KPI, then the KPI disagrees with the charts
**🟡 DEFERRED (by decision)** — Making "Apply" actually rewrite a court's `pricePerHour` and the revenue series (so KPI/charts/Manage agree) is a meaningful behavior change to the faked-AI flow; deferred as a product decision rather than a crash fix.

**Flows:** AI pricing apply (10) ↔ Manage court prices (12) ↔ Analytics charts (10).

`applyInsight` (`venue-provider.tsx:51-70`) marks the insight applied and does
`stats[metric] += delta` from `insight.effect` — and **nothing else**.

- No court `pricePerHour` is ever changed. The sheet's "240.000 → 204.000"
  (`analytics.tsx:504-508`) is the static `priceMove`; after applying, Manage still shows
  the old price and the schedule/reservation prices are unchanged.
- The KPI delta hits `revenueToday`/`occupancy` but **not** `REVENUE_SERIES` (the bars)
  or the heatmap, so after applying, the KPI tile and the revenue chart disagree.
- The Copilot computes "today/week revenue" from `REVENUE_SERIES`
  (`venue-copilot.tsx:146-148`), which never reflects an applied nudge — so Copilot and
  Command/Analytics report different "today" revenue after an apply.
- `priceMove.from` is hardcoded (`240000`/`360000`) and matches the seed courts only by
  coincidence; edit a court's price in Manage and the suggestion's "from" is stale.

## H5 — Request-to-join marks you "joined" before the host approves, leaking a team chat, a notification, and an active-room pill
**✅ RESOLVED** — `requestJoin` no longer adds the room to `joinedIds`; membership is granted only on approval inside `scheduleHostApproval`, so the team chat / notification / active-room pill appear only after the host approves. Pre-approval state is shown via `requestedIds`; `joinRoom` guards against a duplicate request.

**Flows:** Join request/approval (4) ↔ Chat (7) ↔ Notifications (7) ↔ Active-room pill (5).

`requestJoin` adds the room to `joinedIds` immediately (`session.tsx:481`), before
approval. Everything sourced from `joinedRooms` therefore appears pre-approval:

- A synthetic team chat is created (`chat-store.tsx:72-85`).
- A "new team chat" notification is pushed (`notifications.tsx:67-89`).
- The active-room pill shows the room (amber "no court").

This contradicts the documented model ("the host approves before you're in",
`types.ts:150-156`). The user sees themselves as a member of a room they've only
requested.

---

# 🟡 Medium

## M1 — No conflict / double-book check on the matchmaking join or host paths
**Flows:** Join/host (3,4) ↔ booking conflict engine (1).

`conflictFor` runs only in the booking wizard and Create Room dialog. `joinRoom` /
`requestJoin` (`session.tsx:461-496`) never check overlap, so a user can request-join
several rooms whose times overlap each other or a court they already hold. The overlap
only surfaces later when they try to actually book a court for one of them.

## M2 — `cancelBooking` has no ownership/host guard; Rebook is offered on cancelled bookings
**Flows:** Bookings cancel/rebook (6).

- `cancelBooking` (`session.tsx:1273-1299`) branches only on `s.listed`; there is **no
  host/ownership check** (unlike `leaveRoom`, which checks `s.host.initials === USER`,
  `session.tsx:599`). Safe only because every projected booking is currently the user's
  own; a joined non-host session that ever projected as a booking could be "cancelled"
  by the joiner.
- Rebook is shown for **cancelled** bookings identically to completed ones
  (`bookings.tsx:371,488-497,724-733`) and clones their court/team with no
  re-validation.

## M3 — Editable `userName` / `userLevel` desync across surfaces
**Flows:** Profile edit ↔ rooms (5) ↔ pay (1) ↔ chat (7) ↔ conflict engine (1).

The session roster stores the user with the **live** `userName`/`userLevel`
(`session.tsx:868,871,1225,1228`), but several surfaces show the **static seed** identity
for the same person:

- Pay form `cardName` defaults to seed `USER.name` (`book.tsx:219`), not `userName`.
- Outgoing chat author is seed `USER.first` (`chat-store.tsx:127`).
- `conflictFor` is bound to the seed `user` (`data-provider.tsx:173-174`) — it matches on
  the stable `initials` (fine) but is unaware of an edited level.

After a rename, the greeting and room host show the new name while the pay screen and
chat bubbles show the old one.

## M4 — Court edits/deletes leave dangling references; created courts desync from their generated schedule
**Flows:** Court CRUD (12) ↔ Reservations (9) ↔ Schedule (9).

- Reservations reference courts by **display-name string** (`r.court = "Court 2"`,
  `venue.ts:124`), with no id linkage. Rename/delete "Court 2" in Manage and `rv1/rv7`
  still point at a court that no longer exists — no validation anywhere.
- A created court named "Court 1" gets id `vc1007` (`venue-store.ts:142`); the schedule
  hash keys on the **id** (`helpers.ts:693`), so it produces a *different* generated grid
  than the seed "Court 1" (`vc1`) despite the identical display name.
- `addCourt` sets `utilToday: 0` (`venue-store.ts:147`), so a generated-busy column still
  shows 0% utilization in its header.

## M5 — Operator actions are overwhelmingly non-durable; "Check in" is a dead button
**✅ PARTIAL** — the outright-dead "Check in" button now has an `onClick` (local optimistic check-in + toast). The other approve/decline/reschedule/win-back actions remaining local-state/toast is **by design** for the no-database prototype (only Manage CRUD persists, and resets on API restart).

**Flows:** Reservations approve/decline (9), Schedule actions (9), Customers win-back (11), Command check-in (8).

Approve/decline (`reservations.tsx:288-299`, view-local `decisions`, comment says it
"never mutates the data module"), schedule message/reschedule/cancel/add-walk-in/block
(all `toast.*` only), win-back, and copilot "action" chips are all local-state/toast.
Only Manage CRUD persists (and resets on API restart). The Command Center "Check in"
button (`command.tsx:433-437`) has **no `onClick`** at all.

## M6 — Find Courts and the AI Court Assistant advertise availability that contradicts the booking wizard
**Flows:** Find courts (7) / AI assistant (7) ↔ booking conflict engine (1).

`find-courts.tsx:117-131` shows seed `openSlots`/`freePct`; the AI assistant ranks
courts on seed `price/distance/rating` (`court-assistant.tsx:89-113`). Neither consults
`courtSlots`/`conflictFor`. So a court can read "8 open slots / available / recommended"
everywhere except the wizard's calendar, which is the only place that computes real
availability. The assistant's "I'll find you a match" only happens if the user then
completes the wizard with `fillMode:"find"` — it performs no booking/matching itself.

## M7 — Dangling chat/notification references after leaving a room
**Flows:** Leave room (5) ↔ Chat (7) ↔ Notifications (7).

Room chats are keyed `room-${id}` from `joinedRooms` (`chat-store.tsx:15,72`). Leaving
removes the chat but **not** the earlier "new team chat" notification, which still holds
that dead `chatId` (`notifications.tsx:81-83`); clicking it calls
`setActiveChatId(deadId)` → `chat.tsx:22` silently falls back to `chats[0]`. `seenRef`
never forgets, so re-joining the same room produces no new notification.

---

# 🟡 Wizard-level desyncs (booking flow 1)

## M8 — Draft can desync when court/format change after slot/invitee selection
- `setCourt` (`session.tsx:1074-1076`) changes only `courtId`; it does **not** clear the
  chosen `slot`/`day`. A slot valid on court A can become a silent conflict on court B,
  surfaced only if the user revisits the slot step (e.g. via back-navigation).
- `setFormat` silently trims invitees to the new capacity (`session.tsx:1093-1098`).
- `fillMode:"find"` confirm summary shows full-capacity headcount and a per-head price
  (`book.tsx:256-267,295-297`) while the created session has only the host until async
  `fillRoom` runs (`session.tsx:1244`) — the displayed per-head can differ from reality.
- `bookings.tsx` "start booking" relies on call ordering: `openBooking(null)` resets the
  draft, then `setDay` clears the slot, then `setSlot` re-applies it (`bookings.tsx:570-574`).
  Works today but is order-fragile.

> Positive note: the **pay path is well-guarded** — `pay` re-checks `draftConflict`
> (`session.tsx:1259`) and `confirmBooking` re-checks `conflictFor` again
> (`session.tsx:1149`), so a slot taken mid-flow can't be charged. The only gap is UX:
> on a mid-flow conflict the wizard silently returns with a toast and no explicit
> "payment failed" state.

---

# ⚪ Low / By-design tensions

- **L1 — Pre-paid-only vs walk-in/no-show artifacts.** Per project memory, bookings are
  pre-paid (no cash) and no-show *warnings* were stripped but descriptive `noShowRate`
  KPIs kept. Residual `source:"walk-in"`, `status:"no-show"` (`venue.ts`), and
  `kind:"walk-in"` schedule events remain — intentional tension, recorded for clarity.
- **L2 — House availability is sparse.** `courtSlots` only models the 5 fixed hours
  `SLOT_TIMES` 17:00–21:00 (`config.ts:57`), but the booking calendar window is
  06:00–23:00 (`config.ts:63-64`). So 06:00–17:00 and 21:00–23:00 are always "free" to
  the player regardless of the venue. Internally consistent, but the occupancy model is
  thin.
- **L3 — Forming rooms don't hold courts.** A room can advertise a slot (`addRoom`,
  Create Room validates at creation via `conflictFor`) but never reserves it, so two
  forming rooms can advertise the same court/time; the loser finds out only at booking.
  This matches the model (only `status:"booked"` holds a court, `helpers.ts:254-263`) but
  means advertised availability is best-effort.
- **L4 — `chat.members ?? 4`** fabricates "4 members" for seed group chats missing the
  field (`chat.tsx:83`).
- **L5 — Nav naming drift:** venue nav `analytics` route is labeled "Insights"
  (`venue/nav.ts:31-37`); cosmetic.

---

## Suggested triage order

1. **C1** (one-line fix: default `venue-actions.ts` to 6969 / share one `API_URL`) — unblocks the only durable flow.
2. **C2** (length-guard the operator dashboards / Copilot, or give new venues sane empties) — unblocks multi-venue.
3. **C4** (add the capacity check to `scheduleHostApproval`) — invariant fix.
4. **H1/H2/H3/H4** — decide whether each surface is "live" or "marketing snapshot" and make that consistent; the static-vs-live and grid-vs-reservations splits are the most user-visible contradictions.
5. **C3** is architectural — the player and operator do not share a court/availability model. Worth a deliberate decision before either side is taken further.

*The original audit (2026-06-22) changed no code. The 2026-06-22 follow-up applied the
fixes tagged **✅ RESOLVED** above (all 🔴 Critical, H5, and the M5 dead button); see the
**Resolution status** section. Items tagged **🟡 DEFERRED (by decision)** are recorded
source-of-truth/architectural calls left for a deliberate product decision.*
