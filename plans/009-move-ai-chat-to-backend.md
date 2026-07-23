# Plan 009: Move the AI chat logic from the Next.js web app into the NestJS api

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 9c8d129..HEAD -- web/app/api/chat api/src/features/seed api/src/app.module.ts api/src/env.validation.ts api/package.json web/features/play/player-matching.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt / migration
- **Planned at**: commit `9c8d129`, 2026-07-23

## Why this matters

The AI chatbot's core logic — the LLM call, the system prompt, all five tools
(`findCourts`, `findPlayers`, `findRooms`, `bookCourt`, `askChoice`,
`requestAssessment`), the model/provider config, and the booking-conflict
state — currently lives in a **Next.js route handler**
(`web/app/api/chat/route.ts`, 561 lines). Per this repo's architecture the
`api` (NestJS) is the backend that owns data and business logic, while `web`
is the presentation layer that reaches the api server-side with a Clerk Bearer
token (see `web/lib/api.ts`). The AI logic is business logic that fetches
courts/players/rooms over HTTP (`fetchSeed()`) and then reasons over them — it
belongs in the api, next to the services that already hold that data.

After this plan: the LLM/tools/prompt run inside a new `ai` feature in the api
(`POST /api/ai/chat`), using the **official Vercel AI SDK** (`ai` +
`@openrouter/ai-sdk-provider`, the same packages/versions the web app already
uses) and the SDK's documented Node/Express streaming helper
(`result.pipeUIMessageStreamToResponse(res)`). The api's AI tools read
courts/players/rooms **in-process** from the existing `SeedService` instead of
over HTTP. The Next.js `/api/chat` route becomes a thin auth-forwarding
streaming proxy — no AI logic — so the browser client (`useChat()` in
`web/features/chat/ai-native-dashboard.tsx`) needs **zero changes**.

This is the repo-idiomatic move: `web` never exposes the api to the browser
(`API_URL` is server-only and points at `http://api:6969` inside the compose
network), so the client keeps hitting same-origin `/api/chat`, which forwards
to the api with `auth().getToken()` — exactly the pattern
`fetchSeed()`/`fetchStreamCredentials()` already use.

## Current state

### The file being moved

`web/app/api/chat/route.ts` (561 lines) — a Next.js `POST` route handler.
Its shape (read the whole file before porting):

- **Imports** (lines 1–15): `streamText, tool, stepCountIs, hasToolCall,
  convertToModelMessages` and `type UIMessage` from `"ai"`;
  `createOpenRouter` from `"@openrouter/ai-sdk-provider"`; `z` from `"zod"`;
  `auth` from `"@clerk/nextjs/server"`; `fetchSeed` from `"@/lib/api"`;
  `findMatchedPlayers` from `"@/features/play/player-matching"`; shared types;
  `allowRequest` from `"./rate-limit"`.
- **Pure helpers** (lines ~17–210): `haversineKm` + `toRad`; the zod body
  schemas (`sportLevelsSchema`, `latLngSchema`, `bodySchema`);
  `buildUserContext()`; the module-level `bookedSlots = new Map(...)` conflict
  tracker plus `timeToMin`, `resolveDate`, `findConflict`.
- **Provider + config** (lines ~212–225): `const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "" })` and
  `const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4.5"`.
- **`const SYSTEM = ...`** (lines ~227–290): the full system prompt string.
- **`export async function POST(req)`** (lines ~292–561): auth check →
  `allowRequest` rate-limit → missing-key 500 → 64KB body cap → JSON.parse →
  `bodySchema.safeParse` → lazy `getSeed = () => (_seedPromise ??= fetchSeed())`
  → `convertToModelMessages(parsed.data.messages)` → `streamText({...})` with
  `stopWhen` and the `tools` object → `return
  result.toUIMessageStreamResponse({ sendReasoning: true })`.

The tools' `execute` functions call `await getSeed()` and read `courts`,
`players`, `rooms` off the result, and `findPlayers` calls
`findMatchedPlayers(prompt, players, sport, level)`.

### How the browser calls it today

`web/features/chat/ai-native-dashboard.tsx:256` uses the AI SDK React hook with
the default transport (posts to same-origin `/api/chat`):

```ts
const { messages, sendMessage, status, setMessages } = useChat()
```

and sends extra body fields per message (line ~411):

```ts
void sendMessage(
  { text: trimmed },
  { body: { userLevels: activeUserLevels, userLocation, locale } }
)
```

**This file must not change.** The proxy preserves the `/api/chat` contract.

### The rate limiter (stays in web)

`web/app/api/chat/rate-limit.ts` exports `allowRequest(userId)` — an in-memory
per-user fixed-window limiter (10 req/min). It has a test at
`web/app/api/chat/rate-limit.test.ts` wired into the web test suite. **Keep
both files as-is.** Because every chat request flows through the proxy, the
proxy's per-user limit fully protects the downstream api endpoint, and the api
already has a global per-IP `ThrottlerGuard` (120/min, `app.module.ts`).

### The api structure the port must match

- **Native ESM** — every relative import in `api/src` uses a `.js` extension
  (e.g. `import { SeedService } from "../seed/seed.service.js"`). Bare package
  specifiers (`"ai"`, `"zod"`, `"@openrouter/ai-sdk-provider"`) take no
  extension.
- **Config via `ConfigService`, not `process.env`** — see any service.
  Env vars are validated at boot in `api/src/env.validation.ts` (zod).
- **Feature layout** — `api/src/features/<feature>/` with `*.module.ts`,
  `*.controller.ts`, `*.service.ts`, and `*.dto.ts` (class-validator DTOs)
  where a route takes input. Modules are registered in `api/src/app.module.ts`.
- **Errors** — throw Nest `HttpException`s; the global `AllExceptionsFilter`
  renders `{ error: message }`. Never return sentinel error responses.
- **DI metadata caveat** — the tsx/esbuild runner used by tests does **not**
  emit `design:paramtypes`, so constructor injection uses explicit
  `@Inject(Token)`. See `SeedService`'s constructor
  (`api/src/features/seed/seed.service.ts:26-45`) — copy that pattern exactly.
- **`SeedService.buildSeed(userId)`** (`api/src/features/seed/seed.service.ts`)
  returns the full `Seed` including `courts`, `players`, and `rooms` — the same
  aggregate the web `fetchSeed()` fetches over HTTP. The api AI service injects
  `SeedService` and calls `buildSeed(userId)` in-process.
- **`SeedModule` does not currently export `SeedService`**
  (`api/src/features/seed/seed.module.ts` has no `exports` array) — you must add
  one so `AiModule` can inject it.
- **Streaming precedent / `@Res()`** — controllers may take `@Res() res:
  Response` (Express) for manual response control; see
  `api/src/features/assessment/assessment.controller.ts:25`. Express's
  `Response` extends Node's `ServerResponse`, which is exactly what the AI
  SDK's `pipeUIMessageStreamToResponse(res, opts)` expects.

### The matching helper to duplicate

`web/features/play/player-matching.ts` (429 lines) is **pure logic** — its only
import is `import type { Court, Level, Player, SportKey } from
"@/features/dashboard/data"` (types only; that barrel re-exports
`@/lib/shared`). It exports `findMatchedPlayers(prompt, players, selectedSport,
userLevel)` plus the types the web UI uses. The web copy stays (the client
imports its types at `ai-native-dashboard.tsx:75`). Following the repo's
**hand-duplicated shared** convention (CLAUDE.md), copy this file into the api
feature and rewire only its import line.

### Shared types available in the api

`api/src/shared/types.ts` already exports `SportKey`, `Level`, `Player`,
`Court`, `MatchRoom`, and `Seed` (verified). The api-side `player-matching.ts`
imports `Court, Level, Player, SportKey` from `../../shared/index.js`.

### AI SDK API to use (verified against `ai@6.0.221`, installed in web)

The `streamText` result exposes:

```ts
pipeUIMessageStreamToResponse<UI_MESSAGE>(
  response: ServerResponse,
  options?: UIMessageStreamResponseInit & UIMessageStreamOptions<UI_MESSAGE>
): void        // options accepts { sendReasoning?: boolean }
```

Use this in the controller instead of the web route's
`toUIMessageStreamResponse()` (which returns a Web `Response`, awkward to return
from NestJS-on-Express). It sets the UI-message-stream response headers and
streams SSE to the client. Reference: the **official AI SDK NestJS cookbook**
(<https://ai-sdk.dev/cookbook/api-servers/nest>), which uses exactly this
primitive with `@Res() res: Response` and an `async` handler.

The cookbook shows the **standalone-function** form:

```ts
import { pipeUIMessageStreamToResponse, toUIMessageStream } from "ai"
pipeUIMessageStreamToResponse({
  response: res,
  stream: toUIMessageStream({ stream: result.stream }),
})
```

This plan uses the equivalent **method** form on the result —
`result.pipeUIMessageStreamToResponse(res, { sendReasoning: true })` — because
it is the direct analog of the web route's
`result.toUIMessageStreamResponse({ sendReasoning: true })` and carries the
`sendReasoning: true` option through unchanged (the app streams the model's
chain-of-thought into the UI; the standalone `toUIMessageStream` form would drop
reasoning unless separately re-enabled). **Use the method form.** Do not switch
to `pipeTextStreamToResponse`/`toTextStream` — those emit a plain-text stream the
`useChat` client can't parse.

### Secret to relocate (do NOT print its value)

`web/.env.local` currently holds `OPENROUTER_API_KEY` (an OpenRouter API key)
and `OPENROUTER_MODEL`. These move to `api/.env`. **Treat the existing key as
exposed and recommend rotation** when you relocate it — reference it by
location only; never copy the literal value into any committed file, plan, or
message.

## Commands you will need

Run api commands from inside `api/`, web commands from inside `web/`.

| Purpose            | Command (in `api/`)                              | Expected on success        |
|--------------------|--------------------------------------------------|----------------------------|
| Install (api)      | `pnpm install`                                   | exit 0                     |
| Typecheck (api)    | `pnpm typecheck`                                 | exit 0, no errors          |
| Build (api)        | `pnpm build`                                      | exit 0                     |
| Lint (api)         | `pnpm lint`                                       | exit 0                     |
| Test (api, all)    | `pnpm test`                                       | all pass                   |
| Test (single file) | `node --import tsx --test test/ai-chat.test.ts`   | that file's tests pass     |

| Purpose            | Command (in `web/`)                              | Expected on success        |
|--------------------|--------------------------------------------------|----------------------------|
| Typecheck (web)    | `pnpm typecheck`                                  | exit 0, no errors          |
| Lint (web)         | `pnpm lint`                                        | exit 0                     |
| Test (web)         | `pnpm test`                                        | all pass (rate-limit tests still there) |

## Suggested executor toolkit

- **`claude-api` skill** — if available, consult it for AI SDK / model-id
  details before touching the `streamText`/provider config. The model id and
  provider packages here are already correct; do not change them.
- **AI SDK docs** — the "Stream Text" and "Node.js / Express" server pages
  document `pipeUIMessageStreamToResponse`. Do not switch to a different
  streaming primitive.
- Do **not** reach for class-validator on the AI SDK **tool** `inputSchema`s —
  those must stay `zod` (the SDK requires zod/JSON-schema). class-validator is
  only for the HTTP request-body DTO (Step 3).

## Scope

**In scope** (create unless noted):
- `api/src/features/ai/ai.module.ts` (create)
- `api/src/features/ai/ai.controller.ts` (create)
- `api/src/features/ai/ai.service.ts` (create)
- `api/src/features/ai/ai-chat.dto.ts` (create)
- `api/src/features/ai/player-matching.ts` (create — duplicated from web)
- `api/src/features/seed/seed.module.ts` (modify — add `exports: [SeedService]`)
- `api/src/app.module.ts` (modify — register `AiModule`)
- `api/src/env.validation.ts` (modify — add `OPENROUTER_API_KEY`,
  `OPENROUTER_MODEL`)
- `api/package.json` (modify — add `ai` + `@openrouter/ai-sdk-provider` deps)
- `api/.env.example` (modify — document the two new vars)
- `web/app/api/chat/route.ts` (rewrite — thin proxy)
- `web/.env.example` (modify — remove the two `OPENROUTER_*` vars)
- `api/test/ai-chat.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `web/features/chat/ai-native-dashboard.tsx` and any client chat UI — the
  `/api/chat` contract is preserved, so the client must not change.
- `web/app/api/chat/rate-limit.ts` and `web/app/api/chat/rate-limit.test.ts` —
  keep them; the proxy still calls `allowRequest`.
- `web/features/play/player-matching.ts` — the web copy stays as-is (the client
  imports its types). You duplicate it into the api; you do not move it.
- The system prompt text, model id, `reasoning: { effort: "low" }` option,
  tool names, tool `inputSchema`s, `stopWhen` list, and all ranking/conflict
  logic — port **verbatim**. This plan relocates code; it does not redesign
  behavior.
- Any `.env.local` / real secret file — never commit or print secret values.

## Git workflow

- Branch: `advisor/009-move-ai-chat-to-backend`
- Commit per logical unit (e.g. "api: add ai feature", "web: make /api/chat a
  proxy"). This repo's history uses short imperative subjects — match it
  (`git log --oneline -5`).
- Do NOT push, merge, or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the AI SDK dependencies to the api

In `api/package.json`, add to `dependencies` (match the versions the web app
uses so the two copies can't drift — verify against `web/package.json`):

```json
"ai": "^6.0.209",
"@openrouter/ai-sdk-provider": "6.0.0-alpha.1",
```

`zod` (`^4.4.3`) is already a dependency — leave it.

Then install:

**Verify**: `pnpm install` (in `api/`) → exit 0; then confirm both packages
resolve as ESM (they are ESM-only — do **not** use `require()`, which throws
`ERR_REQUIRE_ESM`): `node --input-type=module -e "await import('ai'); await
import('@openrouter/ai-sdk-provider')"` → exit 0. The authoritative resolution
check is the Step 6 `pnpm typecheck`/`pnpm build`.

### Step 2: Duplicate the matching helper into the api

Copy `web/features/play/player-matching.ts` to
`api/src/features/ai/player-matching.ts` **verbatim**, changing only the import
block at the top from:

```ts
import type {
  Court,
  Level,
  Player,
  SportKey,
} from "@/features/dashboard/data"
```

to:

```ts
import type {
  Court,
  Level,
  Player,
  SportKey,
} from "../../shared/index.js"
```

Do not change any other line. Add a one-line comment above the import noting
this is a hand-duplicated copy of `web/features/play/player-matching.ts` (per
the repo's hand-duplicated-shared convention) so future maintainers keep them in
sync.

**Verify**: `pnpm typecheck` (in `api/`) will be run at the end of Step 6; for
now confirm the file exists and the only diff vs the web file is the import
line: `diff <(sed '1,6d' web/features/play/player-matching.ts) <(sed '1,7d'
api/src/features/ai/player-matching.ts)` → no output (bodies identical after
their respective import blocks; adjust the `sed` ranges if you added a comment
line).

### Step 3: Add the request DTO (class-validator)

Create `api/src/features/ai/ai-chat.dto.ts`. This replaces the web route's zod
`bodySchema` and preserves its prompt-injection defense: `userLevels`,
`userLocation`, and `locale` are validated against closed enums / numeric
ranges before they can reach the system prompt. `messages` is left loosely
typed (an array, capped at 50) because the AI SDK's `convertToModelMessages`
does its own structural validation.

Follow the class-validator + nested-DTO pattern (`@ValidateNested` + `@Type`
require nested classes). Target shape:

```ts
import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator"

// Skill level per sport. Closed enum — a crafted value can't smuggle text into
// the system prompt (defence layer 1; the prompt also fences it as untrusted).
export class UserLevelsDto {
  @IsOptional()
  @IsIn(["beginner", "intermediate", "advanced"])
  badminton?: "beginner" | "intermediate" | "advanced"
}

export class UserLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number
}

export class AiChatDto {
  // Handed to convertToModelMessages, which validates structure. We only assert
  // it's an array and cap its length; the controller adds a serialized-size cap.
  @IsArray()
  @ArrayMaxSize(50)
  messages!: unknown[]

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UserLevelsDto)
  userLevels?: UserLevelsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => UserLocationDto)
  userLocation?: UserLocationDto | null

  @IsOptional()
  @IsIn(["en", "vi"])
  locale?: "en" | "vi"
}
```

> **Note on `class-transformer` / `class-validator`**: both are already **direct
> dependencies** in `api/package.json` (`class-transformer@^0.5.1`,
> `class-validator@^0.15.1`) — the existing DTOs use them — so `import { Type }
> from "class-transformer"` resolves. If it somehow does not, STOP and report
> (do not add it as a new dependency without flagging it).

The global `ValidationPipe` (`whitelist: true, transform: true`, wired in
`api/src/main.ts`) validates this DTO automatically when a handler types a
param as `@Body() dto: AiChatDto`.

**Verify**: covered by Step 6 typecheck.

### Step 4: Port the AI logic into `ai.service.ts`

Create `api/src/features/ai/ai.service.ts`. Port the body of the web route's
`POST` function and all its module-level helpers/config into an injectable
service. Concretely:

1. **Copy verbatim** (adjusting nothing but noted below): `haversineKm`,
   `toRad`, `buildUserContext`, the `bookedSlots` Map, `timeToMin`,
   `resolveDate`, `findConflict`, and the entire `SYSTEM` prompt string. These
   can be module-level consts/functions in the file, exactly as in the route.
2. **Provider/model via `ConfigService`** — instead of reading `process.env`
   at module scope, build the provider inside the service using the injected
   config:
   ```ts
   const apiKey = this.config.getOrThrow<string>("OPENROUTER_API_KEY")
   const model = this.config.get<string>("OPENROUTER_MODEL")
     ?? "anthropic/claude-haiku-4.5"
   const openrouter = createOpenRouter({ apiKey })
   ```
   (The missing-key case is now handled at boot by env validation — Step 7 — so
   the route's runtime `if (!process.env.OPENROUTER_API_KEY) return 500` check
   is dropped.)
3. **Constructor** — inject **both** `SeedService` and `ConfigService` with the
   explicit-token pattern (the tsx runner emits no `design:paramtypes`, so
   *every* injected param needs an explicit `@Inject(Token)` — mirror
   `PaymentsService`'s constructor at
   `api/src/features/payments/payments.service.ts:98-114`, which injects
   `ConfigService` exactly this way):
   ```ts
   constructor(
     @Inject(SeedService) private readonly seed: SeedService,
     @Inject(ConfigService) private readonly config: ConfigService
   ) {}
   ```
   Both fields are used below — `this.seed.buildSeed(userId)` for tool data and
   `this.config.getOrThrow(...)` for the provider key. Omitting the
   `@Inject(ConfigService)` token compiles but fails at runtime with a DI
   metadata error (see STOP conditions).
4. **Seed access** — replace the route's `getSeed = () => (_seedPromise ??=
   fetchSeed())` with a lazy loader over the injected service, keyed by the
   caller's userId:
   ```ts
   let seedPromise: ReturnType<SeedService["buildSeed"]> | null = null
   const getSeed = () => (seedPromise ??= this.seed.buildSeed(userId))
   ```
   Inside the tools, `const { courts } = await getSeed()` etc. work unchanged
   because `Seed` has `courts`, `players`, and `rooms`.
5. **`findPlayers` tool** — import `findMatchedPlayers` from
   `./player-matching.js` and call it exactly as the route does.
6. **Method signature** — the method **must be `async`** and return a
   `Promise` of the `streamText` result (the controller awaits it, then
   streams). `convertToModelMessages` returns a `Promise<ModelMessage[]>` — the
   web route `await`s it at `route.ts:270`, so you **must `await` it here too**;
   dropping the `await` passes a Promise as `messages` to `streamText` and
   breaks at typecheck/runtime:
   ```ts
   async streamChat(args: {
     userId: string
     messages: unknown[]
     userLevels?: { badminton?: Level }
     userLocation?: { lat: number; lng: number } | null
     locale?: "en" | "vi"
   }) {
     const { userId, userLevels, userLocation, locale } = args
     // ...build getSeed (uses userId)...
     const messages = await convertToModelMessages(args.messages as UIMessage[])
     const result = streamText({
       model: openrouter(model, { reasoning: { effort: "low" } }),
       system: SYSTEM + buildUserContext(userLevels, userLocation, locale),
       messages,
       stopWhen: [ /* identical to route */ ],
       tools: { /* identical to route */ },
     })
     return result
   }
   ```
   Keep `stopWhen`, every tool's `description`/`inputSchema`/`execute`, and the
   `reasoning: { effort: "low" }` option **byte-for-byte identical** to the
   route (modulo the `getSeed`/`findMatchedPlayers` import wiring).
7. **Imports** — from `"ai"`: `streamText, tool, stepCountIs, hasToolCall,
   convertToModelMessages, type UIMessage`. From
   `"@openrouter/ai-sdk-provider"`: `createOpenRouter`. From `"zod"`: `z`.
   From `"@nestjs/common"`: `Inject, Injectable`. From
   `"@nestjs/config"`: `ConfigService` (inject it too). Relative imports:
   `../seed/seed.service.js`, `./player-matching.js`, and shared types from
   `../../shared/index.js`. All relative imports carry `.js`.

> The tool `inputSchema`s stay `z.object({...})` — the AI SDK requires zod
> here. This is **not** a violation of the repo's "class-validator over zod for
> request validation" convention, which governs HTTP request DTOs (Step 3), not
> AI SDK tool schemas.

**Verify**: covered by Step 6 typecheck + build.

### Step 5: Add the controller and module

Create `api/src/features/ai/ai.controller.ts`:

```ts
import { Body, Controller, Post, Res } from "@nestjs/common"
import type { Response } from "express"

import { UserId } from "../../common/user-id.decorator.js"
import { AiChatDto } from "./ai-chat.dto.js"
import { AiService } from "./ai.service.js"

// POST /api/ai/chat — the AI chat backend. The global ClerkAuthGuard requires a
// signed-in user (the web proxy forwards the caller's Clerk token). Streams a
// UI-message stream via the AI SDK's Node/Express helper.
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  async chat(
    @UserId() userId: string,
    @Body() dto: AiChatDto,
    @Res() res: Response
  ): Promise<void> {
    const result = await this.ai.streamChat({
      userId,
      messages: dto.messages,
      userLevels: dto.userLevels,
      userLocation: dto.userLocation ?? null,
      locale: dto.locale,
    })
    result.pipeUIMessageStreamToResponse(res, { sendReasoning: true })
  }
}
```

> `@Res()` gives the AI SDK a Node `ServerResponse` to stream into. Validation
> (`AiChatDto`) and auth (`ClerkAuthGuard`, `@UserId()`) still run *before* the
> handler body, so a bad body / missing token is rejected by the global
> `ValidationPipe` / guard and rendered by `AllExceptionsFilter` as usual — the
> stream only starts after those pass. Do not add a manual try/catch around
> `pipeUIMessageStreamToResponse`; the SDK owns mid-stream error handling.

Create `api/src/features/ai/ai.module.ts`:

```ts
import { Module } from "@nestjs/common"

import { SeedModule } from "../seed/seed.module.js"
import { AiController } from "./ai.controller.js"
import { AiService } from "./ai.service.js"

@Module({
  imports: [SeedModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
```

In `api/src/features/seed/seed.module.ts`, add an `exports` array so
`SeedService` is injectable in `AiModule`:

```ts
@Module({
  imports: [ /* unchanged */ ],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
```

In `api/src/app.module.ts`, import and register `AiModule` alongside the other
feature modules (add `import { AiModule } from
"./features/ai/ai.module.js"` and add `AiModule` to the `imports` array).

**Verify**: `pnpm build` (in `api/`) → exit 0 (Nest resolves the module graph;
a missing `exports` or unregistered module fails here or at runtime).

### Step 6: Typecheck, lint, build the api

**Verify** (in `api/`):
- `pnpm typecheck` → exit 0, no errors
- `pnpm lint` → exit 0
- `pnpm build` → exit 0

If typecheck complains that constructor injection lacks metadata (a
`design:paramtypes` / tsx DI error surfaces at test/runtime, not typecheck),
ensure you used `@Inject(SeedService)` in `AiService` — see the STOP conditions.

### Step 7: Add the two env vars to api boot validation and example

In `api/src/env.validation.ts`, add to the `envSchema` object (match the file's
style and comments):

```ts
// OpenRouter (Vercel AI SDK provider) — powers POST /api/ai/chat. Required so a
// missing key crashes at boot instead of 500ing the first chat request. The
// model defaults to a small reasoning-capable model; override per deployment.
OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-haiku-4.5"),
```

In `api/.env.example`, add (documentation only — no real values):

```
# OpenRouter API key for POST /api/ai/chat (Vercel AI SDK).
OPENROUTER_API_KEY=
# Model for the chatbot. Default is a small reasoning-capable model whose chain
# of thought streams into the UI. Override with any OpenRouter model that
# returns a `reasoning` field (effort is requested as "low").
# OPENROUTER_MODEL=anthropic/claude-haiku-4.5
```

**Relocate the running secret**: move the actual `OPENROUTER_API_KEY` (and any
`OPENROUTER_MODEL` override) from `web/.env.local` into `api/.env` so the api
boots. Do this in the local untracked env file only — **never** commit it and
**never** print the value. Because the key has lived in the web env, recommend
in your final report that the operator **rotate** it.

Then remove the two `OPENROUTER_*` vars from `web/.env.example` (the web app no
longer reads them). Leave `web/.env.local` cleanup to the operator (untracked;
mention it).

**Verify**: with `OPENROUTER_API_KEY` set in `api/.env`, `pnpm build`
(in `api/`) → exit 0. (Full boot is exercised in the test at Step 9.)

### Step 8: Rewrite `web/app/api/chat/route.ts` as a thin proxy

Replace the **entire** file with a proxy that keeps the auth + per-user
rate-limit + oversize guard at the edge, then forwards to the api and streams
the response back. Keep it on the Node.js runtime (the default — do **not** add
`export const runtime = "edge"`).

```ts
import { auth } from "@clerk/nextjs/server"

import { API_URL } from "@/lib/api"
import { allowRequest } from "./rate-limit"

// Thin auth-forwarding streaming proxy. The AI logic (model, prompt, tools)
// lives in the api at POST /api/ai/chat; this route forwards the browser's
// request there with the caller's Clerk Bearer token and streams the
// UI-message-stream response straight back. The per-user rate limit stays here
// because every chat request funnels through this proxy.
export async function POST(req: Request) {
  const { userId, getToken } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  if (!allowRequest(userId)) {
    return new Response("Too many requests — thử lại sau một phút nhé.", {
      status: 429,
      headers: { "Retry-After": "60" },
    })
  }

  // Cheap edge DoS guard: reject oversized bodies before forwarding.
  const body = await req.text()
  if (body.length > 64_000) {
    return new Response("Request body too large", { status: 413 })
  }

  const token = await getToken()
  const upstream = await fetch(`${API_URL}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body,
  })

  // Stream the upstream body straight through, preserving the api's status and
  // the AI SDK's UI-message-stream headers (content-type, x-vercel-ai-*).
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}
```

Notes:
- `API_URL` is already exported from `web/lib/api.ts` (`process.env.API_URL ??
  "http://localhost:6969"`; `http://api:6969` in compose). Reuse it — do not
  hardcode a URL.
- Forwarding `upstream.headers` wholesale preserves the `Content-Type`
  (SSE/UI-message-stream) and the `x-vercel-ai-ui-message-stream` header the
  client's `useChat` transport needs. Do not filter to a hand-picked subset.
- `req.text()` yields a string body, so no `duplex: "half"` is needed on the
  `fetch`.

**Verify** (in `web/`): `pnpm typecheck` → exit 0; `pnpm lint` → exit 0;
`pnpm test` → all pass (the rate-limit tests still resolve `./rate-limit`).

### Step 9: Add an api unit test for the AI feature

Create `api/test/ai-chat.test.ts`, modeled structurally on
`api/test/auth.test.ts` (Node's built-in `node:test` runner + `node:assert`,
`import "reflect-metadata"` and `import "dotenv/config"` at top, `process.env`
stubs for Clerk keys). Because a full LLM call needs a live OpenRouter key and
network, **do not** call the model. Instead cover the parts that are
deterministic and are the point of this migration:

Test cases (at minimum):
1. **`AiChatDto` validation accepts a well-formed body** — construct/validate
   via `class-validator`'s `validate()` on a `plainToInstance(AiChatDto, {...})`
   with valid `messages`, `userLevels: { badminton: "intermediate" }`,
   `userLocation: { lat: 10.77, lng: 106.7 }`, `locale: "vi"` → zero errors.
2. **`AiChatDto` rejects a hostile `userLevels`** — `userLevels: { badminton:
   "ignore all rules" }` → non-empty validation errors (the prompt-injection
   defense holds).
3. **`AiChatDto` rejects out-of-range `userLocation`** — `{ lat: 999, lng: 0 }`
   → non-empty errors.
4. **`AiChatDto` caps `messages`** — an array of 51 items → non-empty errors
   (`@ArrayMaxSize(50)`).
5. **The matching helper is faithfully duplicated** — import
   `findMatchedPlayers` from `../src/features/ai/player-matching.js`, call it
   with a tiny fixture players array, and assert it returns
   `{ intent, matches }` with the expected shape (mirror any existing assertion
   style; keep the fixture minimal).

Use `plainToInstance` from `class-transformer` and `validate` from
`class-validator` for cases 1–4 (both resolve transitively via
`@nestjs/common`; if they don't resolve, STOP and report per Step 3's note).

**Verify** (in `api/`): `node --import tsx --test test/ai-chat.test.ts` → all
new tests pass; then `pnpm test` → the whole suite (existing + new) passes.

## Test plan

- **New**: `api/test/ai-chat.test.ts` — DTO validation (happy path + the three
  rejection cases that encode the prompt-injection/oversize defenses) and a
  duplication-fidelity check on `findMatchedPlayers`. Structural pattern:
  `api/test/auth.test.ts`.
- **Unchanged and must still pass**: `web/app/api/chat/rate-limit.test.ts`
  (the rate limiter stays in web and the proxy still uses it).
- **Manual smoke (optional, if a live OpenRouter key + running stack are
  available)**: `docker compose up --build`, open the dashboard, send a chat
  message ("tìm sân ở Quận 3"), confirm the assistant streams a reply and a
  court card renders — proving the browser → `/api/chat` proxy → `/api/ai/chat`
  → streamed UI-message-stream round-trip works end to end. If no key is
  available, note it as not-run rather than guessing.
- **Verification**: `pnpm test` in `api/` → all pass incl. the new file;
  `pnpm test` in `web/` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` (in `api/`) exits 0
- [ ] `pnpm build` (in `api/`) exits 0
- [ ] `pnpm lint` (in `api/`) exits 0
- [ ] `pnpm test` (in `api/`) exits 0; `api/test/ai-chat.test.ts` exists and its
      tests pass
- [ ] `pnpm typecheck` (in `web/`) exits 0
- [ ] `pnpm lint` (in `web/`) exits 0
- [ ] `pnpm test` (in `web/`) exits 0 (rate-limit tests still pass)
- [ ] `web/app/api/chat/route.ts` no longer imports `"ai"`,
      `"@openrouter/ai-sdk-provider"`, or `fetchSeed`:
      `grep -nE "from \"ai\"|openrouter|fetchSeed" web/app/api/chat/route.ts`
      returns no matches
- [ ] The api owns the logic:
      `grep -rn "streamText" api/src/features/ai` returns matches, and
      `grep -rn "streamText" web/app/api/chat` returns none
- [ ] `AiModule` is registered in `api/src/app.module.ts` and `SeedModule`
      exports `SeedService`
- [ ] No files outside the in-scope list are modified (`git status`) — in
      particular `web/features/chat/ai-native-dashboard.tsx` is untouched
- [ ] No secret value appears in any tracked file (`git diff` shows no key
      literal; `web/.env.example` has the `OPENROUTER_*` vars removed and
      `api/.env.example` has them added blank)
- [ ] `plans/README.md` status row for 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `web/app/api/chat/route.ts`, `player-matching.ts`,
  `SeedService.buildSeed`, or `app.module.ts` has changed materially since
  commit `9c8d129` and the "Current state" excerpts no longer match.
- `SeedService.buildSeed(userId)`'s returned `Seed` no longer includes
  `courts`, `players`, or `rooms` (the tools depend on all three).
- `class-transformer` / `class-validator` (`Type`, `plainToInstance`,
  `validate`) do **not** resolve without adding a new top-level dependency —
  flag it rather than adding packages the repo didn't already carry.
- A DI/metadata error (`Cannot read properties of undefined` /
  `paramtypes`) appears when running the api or its tests — this means an
  `@Inject(Token)` is missing on a constructor param (the tsx runner needs
  explicit tokens). Fix by mirroring `SeedService`'s constructor; if it
  persists after that, STOP.
- The streamed response reaches the browser but the client renders nothing /
  a parse error — likely the proxy dropped the UI-message-stream headers.
  Confirm the proxy forwards `upstream.headers` wholesale; if it still fails,
  STOP (do not start hand-crafting SSE).
- Any verification fails twice after a reasonable fix attempt.
- The task appears to require editing an out-of-scope file (especially the
  client chat UI or the rate-limiter).

## Maintenance notes

For the human/agent who owns this after it lands:

- **Two copies of `player-matching.ts`** now exist
  (`web/features/play/` and `api/src/features/ai/`), hand-kept in sync per the
  repo's shared-code convention. Any change to matching logic must update both.
  A future CI drift-diff job (mentioned in `plans/README.md`'s rejected items)
  could guard this.
- **The AI SDK / provider versions are duplicated** across `web/package.json`
  and `api/package.json`. Keep them in lockstep on upgrade — a `streamText`
  behavior or UI-message-stream wire-format change on one side without the
  other could desync the proxy and the client transport.
- **The `bookedSlots` conflict tracker** is now a module-level `Map` in the api
  (as it was in web) — still a single-instance, resets-on-restart prototype
  store. When bookings move fully to the DB path, retire it there.
- **Rate limiting stays in the web proxy.** If the api ever gains a second
  caller for `/api/ai/chat` (i.e. not exclusively via the web proxy), move the
  per-user limit into the api (a custom `ThrottlerGuard` keyed by `@UserId()`),
  because the global per-IP throttler sees all proxied traffic as one IP.
- **Reviewer focus**: (1) the tool `execute` bodies are byte-for-byte the
  route's (no behavior drift); (2) the proxy forwards status + headers faithfully
  and preserves the 401/429/413 edge behaviors; (3) no secret landed in a
  tracked file, and the exposed OpenRouter key was flagged for rotation.
- **Deferred**: making the api the sole enforcer of the chat rate limit, and a
  real end-to-end streaming test (needs a live model key / mock provider) — both
  out of scope here.
```
