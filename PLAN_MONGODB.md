# PLAN: Add MongoDB Backend Persistence

## 1. Current State

This repository is a pnpm/Turborepo monorepo:

- `apps/web`: Next.js frontend.
- `apps/api`: Hono API on Node, default port `6969`.
- `packages/shared`: shared TypeScript domain types and helpers.

The API already exists, but most product data is still prototype data:

- Player/court data is read from `apps/api/src/data/player.ts`.
- Dashboard seed data is built from hardcoded records in `apps/api/src/data/seed.ts`.
- Venue/operator data is initialized from `apps/api/src/data/venue.ts`.
- Venue mutations currently live in `apps/api/src/store/venue-store.ts` and are only in-memory, so process restart resets them.
- `apps/api` still contains Prisma/Neon/Postgres scaffolding (`src/db.ts`, `prisma/`, `DATABASE_URL`) that does not match the desired MongoDB direction.

Goal: keep the existing Hono backend, but replace mock/in-memory persistence with MongoDB-backed repositories.

## 2. Target Architecture

Use MongoDB as the main application database behind `apps/api`.

Recommended API structure:

```txt
apps/api/src/
  db/
    mongo.ts                 # MongoClient singleton and database helper
    indexes.ts               # index creation for unique/query-heavy fields
  repositories/
    courts.repository.ts
    players.repository.ts
    venues.repository.ts
    reservations.repository.ts
    bookings.repository.ts
    rooms.repository.ts
    users.repository.ts      # only if app-owned user profile data is needed
  routes/
    courts.ts
    player.ts
    seed.ts
    venue.ts
    venues.ts
  scripts/
    seed-mongo.ts
    db-check.ts
```

Keep route files thin:

- Validate input with existing `zod` schemas.
- Call repository functions.
- Convert repository errors into `HTTPException`.
- Return the same response shape that `apps/web` already expects.

## 3. Dependency Decision

Use the official MongoDB Node driver first:

```bash
pnpm --filter api add mongodb
```

Reason:

- The current app already uses shared TypeScript types and zod validation.
- The first migration mainly needs reliable CRUD and indexes.
- Avoid introducing an ODM before the data model stabilizes.

Only add Mongoose later if the project needs ODM-specific features such as middleware-heavy schemas, discriminators, or model-level validation beyond zod.

## 4. Environment Variables

Update `apps/api/.env.example`:

```env
# MongoDB
MONGODB_URI="mongodb://localhost:27017"
MONGODB_DB="sportmatch"

# Server
WEB_URL="http://localhost:3000"
PORT="6969"
```

Update `apps/api/.env` locally with the same values.

After MongoDB is adopted, decide whether to remove or leave the old Prisma/Neon env fields. Do not keep both as active database sources unless there is a clear split of responsibility.

## 5. Local MongoDB Setup

Add a root-level `docker-compose.yml` or `docker-compose.mongo.yml`:

```yaml
services:
  mongodb:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

Suggested commands:

```bash
docker compose up -d mongodb
pnpm --filter api db:check
pnpm --filter api seed:mongo
pnpm dev
```

If the repo later uses Docker for the whole stack, wire `apps/api` to `mongodb://mongodb:27017` inside Compose and keep `mongodb://localhost:27017` for host-based development.

## 6. Mongo Client Layer

Create `apps/api/src/db/mongo.ts`:

- Load env through existing `dotenv/config`.
- Require `MONGODB_URI` and `MONGODB_DB`.
- Reuse one `MongoClient` across dev hot reloads.
- Export:
  - `mongoClient`
  - `db`
  - typed collection helpers, for example `collections.venues()`.

Expected behavior:

- API startup should fail loudly if Mongo env is missing.
- `db:check` should ping Mongo and print the connected database name.
- Shutdown should close the client if needed, or rely on process exit for local dev.

## 7. Collection Model

Start with collections that match the current product surface.

### `venues`

Stores venue profile fields currently represented by `Venue`.

Important fields:

- `_id`
- `slug` or `publicId` such as current `v1`
- `name`
- `image`
- `description`
- `district`
- `city`
- `sports`
- `openFrom`
- `openTo`
- `manager`
- `rating`
- `reviews`
- `createdAt`
- `updatedAt`

Indexes:

- unique `publicId`
- `{ city: 1, district: 1 }`
- `{ sports: 1 }`

### `venue_courts`

Stores courts scoped to a venue.

Important fields:

- `_id`
- `publicId`
- `venueId`
- `name`
- `sport`
- `surface`
- `state`
- `pricePerHour`
- `createdAt`
- `updatedAt`

Indexes:

- unique `{ venueId: 1, publicId: 1 }`
- `{ venueId: 1, sport: 1 }`

### `reservations`

Stores bookings, app bookings, and walk-ins.

Important fields:

- `_id`
- `publicId`
- `venueId`
- `courtId`
- `customer`
- `sport`
- `dayKey`
- `start`
- `durationMin`
- `time`
- `party`
- `source`
- `status`
- `price`
- `noShowRisk`
- `isRegular`
- `createdAt`
- `updatedAt`

Indexes:

- `{ venueId: 1, courtId: 1, dayKey: 1, start: 1 }`
- `{ venueId: 1, status: 1 }`
- `{ "customer.phone": 1 }`

Conflict checks for reservations must query active reservations for the same venue, court, and day, then apply the existing overlap logic from `venue-store.ts`.

### `customers`

Stores venue customer rows derived from reservations and future user profiles.

Important fields:

- `_id`
- `venueId`
- `name`
- `initials`
- `phone`
- `favoriteSport`
- `visits`
- `ltv`
- `tags`
- `lastVisit`
- `createdAt`
- `updatedAt`

Indexes:

- unique `{ venueId: 1, phone: 1 }`
- `{ venueId: 1, favoriteSport: 1 }`

### `players`, `rooms`, `bookings`, `chats`

Migrate after venue persistence is stable. These currently feed the player dashboard seed and can remain seeded/mock for phase 1.

## 8. Migration Phases

### Phase 1: Mongo foundation

1. Add `mongodb` package to `apps/api`.
2. Add `apps/api/src/db/mongo.ts`.
3. Add `apps/api/src/db/indexes.ts`.
4. Replace `apps/api/scripts/db-check.ts` so it pings Mongo instead of Prisma.
5. Add `seed:mongo` script that inserts the existing seed data from `apps/api/src/data/venue.ts` and `apps/api/src/data/player.ts`.
6. Update `apps/api/.env.example`.
7. Add local Mongo Compose file.

Acceptance:

- `docker compose up -d mongodb` starts Mongo.
- `pnpm --filter api db:check` passes.
- `pnpm --filter api seed:mongo` can run repeatedly without duplicating seed records.

### Phase 2: Persist venue management

1. Create `venues.repository.ts`.
2. Move `listVenues`, `getVenue`, `createVenue`, `updateVenue`, and `removeVenue` out of `venue-store.ts`.
3. Update `apps/api/src/routes/venues.ts` to call the repository.
4. Preserve existing response shape so `apps/web` does not need UI changes.

Acceptance:

- Create/update/delete venue survives API restart.
- Cannot delete the last venue.
- Unknown venue still returns 404 where current routes expect 404.

### Phase 3: Persist courts and walk-in reservations

1. Create `courts.repository.ts`.
2. Create `reservations.repository.ts`.
3. Port existing validation/business rules from `venue-store.ts`:
   - court must exist;
   - maintenance court cannot be booked;
   - duration must be 15-minute increments;
   - reservation must be inside opening hours;
   - overlapping active reservations are rejected.
4. Update `/api/venues/:id/courts` and `/api/venues/:id/reservations/walk-in`.
5. Update customer upsert logic so walk-ins update `customers`.

Acceptance:

- Added courts survive API restart.
- Walk-in reservations survive API restart.
- Schedule and reservation table reflect created walk-ins after refresh.
- Double booking the same court/time returns a 400.

### Phase 4: Persist venue bundle reads

1. Replace `activeBundle()` and `venueBundle()` with repository-backed bundle builders.
2. Keep derived analytics initially computed in code if needed.
3. If stats are expensive later, materialize them into a `venue_daily_metrics` collection.

Acceptance:

- `/api/venue/bundle?venue=<id>` returns the same shape as today.
- `/api/seed?venue=<id>` still hydrates `apps/web/app/[locale]/dashboard/venue/[venueId]`.
- The dashboard does not fall back silently to the wrong venue on invalid IDs.

### Phase 5: Persist player-facing flows

Migrate after operator flows are stable.

Suggested order:

1. Courts search/listing.
2. Player profile and assessment level.
3. Bookings.
4. Rooms and invite-room creation.
5. Chats/messages if they need server persistence.

Acceptance:

- Player dashboard seed no longer depends on static `COURTS`, `ROOMS`, or derived mock sessions for core workflows.
- Booking and room state survives refresh and API restart.

### Phase 6: Remove stale Postgres/Prisma path

Once MongoDB owns persistence:

1. Remove Prisma/Neon dependencies if Better Auth no longer needs them.
2. Remove `apps/api/prisma`.
3. Remove `apps/api/prisma.config.ts`.
4. Replace old README database section with MongoDB instructions.
5. Remove `DATABASE_URL` from API env examples if unused.

If auth still needs SQL, document the split clearly:

- MongoDB: product data.
- Postgres/Prisma: auth tables only.

Do not leave ambiguous code paths where product routes can read from both databases.

## 9. API Contract Rules

During migration, keep these stable for the frontend:

- `/api/seed`
- `/api/courts`
- `/api/courts/:id`
- `/api/venues`
- `/api/venues/:id`
- `/api/venues/:id/courts`
- `/api/venues/:id/reservations/walk-in`
- `/api/venue/bundle`
- `/api/venue/reservations`
- `/api/venue/customers`
- `/api/venue/analytics`

Only change response shapes after updating `packages/shared/src/types.ts` and every consuming web component.

## 10. Testing And Verification

Minimum checks after each phase:

```bash
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter web typecheck
pnpm build
```

Manual smoke tests:

1. Start MongoDB.
2. Start API: `pnpm --filter api dev`.
3. Start web: `pnpm --filter web dev`.
4. Open `/en/dashboard`.
5. Open a venue workspace.
6. Create a venue.
7. Add a court.
8. Add a walk-in reservation.
9. Restart API.
10. Refresh web and confirm the created records still exist.

Useful direct API checks:

```bash
curl http://localhost:6969/health
curl http://localhost:6969/api/venues
curl "http://localhost:6969/api/venue/bundle?venue=v1"
```

## 11. Implementation Order For The First PR

Keep the first PR small:

1. Add Mongo dependency and env example.
2. Add local Mongo Compose file.
3. Add `mongo.ts`, `indexes.ts`, and Mongo `db:check`.
4. Add idempotent seed script.
5. Persist only venue profile CRUD.
6. Update API README.

Do not migrate player dashboard, auth, chat, or analytics in the first PR.

## 12. Risks

- The current API README and package scripts still mention Prisma/Neon. Update docs as soon as the real Mongo path exists.
- `apps/web` server-renders dashboard data through the API. If Mongo is unavailable, dashboard pages may fail during SSR. Add clear API errors and local setup docs.
- The venue bundle response is broad. Keep the shape stable while repositories are introduced.
- Reservation conflict logic is business-critical. Port the existing overlap rules first, then add tests around edge cases.
- Generated IDs like `v1`, `vc1001`, and `rv1001` are currently sequence-based. Mongo can store ObjectIds internally, but public IDs should remain stable until the frontend is updated.

