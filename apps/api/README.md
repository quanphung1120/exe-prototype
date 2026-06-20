# api

The SportMatch AI backend — a [Hono](https://hono.dev) server running on Node via
`@hono/node-server`. This is a scaffold: routes return mock data, mirroring the
front-end-only prototype.

## Scripts

```bash
pnpm --filter api dev        # tsx watch (hot reload) on http://localhost:3001
pnpm --filter api build      # tsc -> dist/
pnpm --filter api start      # node dist/index.js
pnpm --filter api typecheck  # tsc --noEmit
pnpm --filter api lint       # eslint
```

`PORT` overrides the listen port (default `3001`).

## Routes

| Method | Path              | Notes                                  |
| ------ | ----------------- | -------------------------------------- |
| GET    | `/health`         | Liveness check                         |
| GET    | `/api/courts`     | List courts (zod-validated query)      |
| GET    | `/api/courts/:id` | Get one court                          |
| POST   | `/api/courts`     | Create a court (zod-validated body)    |

## RPC types

`index.ts` exports `AppType` (the chained route tree). A type-only consumer can
`import type { AppType }` and build a fully typed client with `hc<AppType>()`
from `hono/client` — no runtime coupling.
