# Market Readiness — Business Flows & Rules Gap Analysis

> Status as of 2026-07-03, branch `redesign/landing-3d`. Grounded in what the code
> actually enforces today. What's solid: the interval-overlap math (`conflictFor` in
> `packages/shared/src/helpers.ts`) and the walk-in reservation validation
> (`apps/api/src/store/venue-store.ts`). Almost everything else gating money,
> identity, or fairness is faked client-side or missing.

## The foundation problem (everything depends on this)

All player-side business rules run **only in the browser**, and the Hono API is
**unauthenticated with no write endpoints for the player domain**. Booking, joining
rooms, paying, capacity checks — all React state in `session.tsx`, gone on reload,
invisible to other users. The venue CRUD endpoints (`POST/DELETE /api/venues/*`) are
open to anyone with no token check (`proxy.ts` gates only `/api/chat`).

**Non-negotiable move:** the server becomes the source of truth for sessions,
bookings, and payments, with Clerk-verified identity on every Hono route. A
client-side check is a UX hint, not a rule. Prisma + Neon is already wired; the work
is designing the schema (Session, Booking, Payment, RoomMembership, TrustEvent) and
moving the rules across.

## Booking flow — cases to cover

1. **Real inventory + atomic slot locking.** Availability is currently hash-faked
   (`courtSlots`). With real inventory, two users can race for the same slot. Add a
   short-lived **slot hold** (5–10 min lock created on entering payment, released on
   abandon/expiry) and a unique DB constraint on `(court, day, slot-range)` at
   booking commit so the database — not application code — is the last line of
   defense.
2. **Payment must be verified, idempotent, and reconciled.** Today `pay()` is a
   `setTimeout` and the QR is decorative. Needed: real VietQR/gateway (PayOS, Casso,
   VNPay…), server-side webhook confirmation before flipping to `booked`, an
   idempotency key per booking attempt, and a handled path for "user paid but slot
   got taken meanwhile" → automatic refund. Also handle: payment succeeds but user
   closes the tab (webhook still books it), partial/duplicate transfers, payment
   timeout while the hold expires.
3. **Cancellation & refund policy — currently there is none.** The 5% hold fee is
   charged and never tracked or refunded. Define tiers, e.g.: free cancel >24h (full
   refund), 6–24h (lose the hold fee), <6h / no-show (lose fee + trust penalty).
   Pre-paid-only means this policy is the entire revenue-protection story — show it
   at confirm time.
4. **Venue-side cancellations.** A venue closing a court (maintenance, weather) must
   notify affected bookings, auto-refund in full, and ideally auto-suggest
   rebooking. Venue maintenance state and player bookings don't talk to each other
   today.
5. **Booking modification** (change slot/duration) is absent — users will otherwise
   cancel+rebook and hit the fee policy unfairly.

## Matchmaking / rooms — cases to cover

6. **One player, unlimited simultaneous rooms.** `joinedIds` is a `Set` with no
   limit and no time-conflict check — a player can hold seats in five rooms at the
   same hour, then ghost four. Fixes, in priority order:
   - **Time-overlap guard on join**: may not join/host a room whose time overlaps
     another room you're `going`/`host` in, or an existing booking. Highest-value
     rule; the overlap math (`conflictFor`) already exists.
   - **Cap concurrent pending join-requests** (e.g. 3) — `MAX_HOSTED_ROOMS=3`
     covers hosting but joining is unlimited.
   - **Commitment escalation**: joining within N hours of start requires a small
     deposit, or leaving late costs a reliability strike.
7. **Host abuse.** Hosts can kick freely and approve/decline with no consequence.
   Add: kicking after the room is booked+paid triggers refund of that member's
   share; declined joiners get a per-room re-request cooldown; a host abandoning a
   paid room triggers automatic refunds, not just a state flip.
8. **No-show → trust loop is dead code.** `trustTier` exists but nothing mutates
   trust. Wire it: venue check-in (QR scan at the court verifies attendance),
   no-show without cancel decrements trust, low trust ⇒ deposits required to join,
   very low ⇒ join-requests throttled. This is the main anti-abuse mechanism.
9. **Skill level is self-declared in localStorage and only soft-filters.** Fully
   client-editable, so a sandbagging 4.5 player can farm beginner rooms.
   Server-store the assessment, let hosts set a *hard* level gate per room
   (`levelMatches` never blocks today), and adjust level over time from post-match
   peer confirmations.
10. **Quick Match queue edge cases**: match forms but one side's slot got booked
    meanwhile; queue expiry; matched-then-declined re-queue priority. Only one
    search runs at a time (good), but resolution is entirely faked timers.

## Abuse / integrity beyond the two flows

11. **Identity spoofing**: `userName` and roster entries are client-supplied. All
    membership/booking writes must derive identity from the Clerk session
    server-side, never from the request body.
12. **Rate limiting** on join requests, room creation, and booking attempts (per
    user + per IP) — a bot hitting the open API today could create thousands of
    venues.
13. **One account per person**: phone verification (standard for VN marketplaces)
    before first booking; also enables Zalo/SMS reminders, which directly reduce
    no-shows.
14. **Venue-side trust**: venues that repeatedly cancel confirmed bookings should
    surface a reliability score too — abuse prevention cuts both ways in a
    two-sided market.

## Suggested sequencing

1. Server-authoritative bookings/sessions with Clerk auth on the API. *(launch blocker)*
2. Real payment + webhook verification + refund path, with the cancellation policy defined. *(launch blocker)*
3. Overlap guard on room joins + pending-request cap — cheap, reuses `conflictFor`. *(day-one abuse hole)*
4. Check-in + no-show → trust score loop, then deposit gating for low-trust users. *(first weeks post-launch)*
5. Hard level gates and rate limiting. *(first weeks post-launch)*
