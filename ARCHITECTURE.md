# Architecture

How the project is laid out and, more importantly, how work moves through it.
`README.md` covers installing and running. This file covers where each piece
lives and which order things happen in.

The short version: the browser never talks to Google. It talks to the AdonisJS
backend on port 3333, and that backend is the only thing holding the Gemini API
key.

```
  browser (Nuxt 4, :3000)
        |
        |  fetch + Bearer token, JSON or text/event-stream
        v
  backend (AdonisJS 6, :3333)
        |
        |  @google/genai, key read from backend/.env
        v
  Gemini API
```

---

## Contents

- [Top level](#top-level)
- [Backend layout](#backend-layout)
- [Frontend layout](#frontend-layout)
- [Workflow 1: boot](#workflow-1-boot)
- [Workflow 2: authentication](#workflow-2-authentication)
- [Workflow 3: loading the model list](#workflow-3-loading-the-model-list)
- [Workflow 4: sending a message (streaming)](#workflow-4-sending-a-message-streaming)
- [Workflow 5: what the model discovery decides](#workflow-5-what-the-model-discovery-decides)
- [Where a change usually belongs](#where-a-change-usually-belongs)

---

## Top level

```
gemini_chatbot/
  package.json          npm workspaces root, runs both halves
  package-lock.json
  .gitignore            node_modules, build output, and every .env
  README.md             install and run
  ARCHITECTURE.md       this file
  backend/              AdonisJS 6 API and the Gemini integration
  frontend/             Nuxt 4 chat interface
```

`package.json` declares `workspaces: ["backend", "frontend"]`, so there is one
`node_modules` at the root and one lockfile. That is also why `@google/genai`
is not visible under `backend/node_modules` even though the backend imports it
everywhere: npm hoists it. Run scripts from the root as
`npm.cmd run dev --workspace backend`, or from inside a package directory.

`.gitignore` is the reason `backend/.env` is not in the repository. Only
`backend/.env.example` is tracked, and it ships with an empty
`GEMINI_API_KEY=` and `APP_KEY=`.

---

## Backend layout

```
backend/
  ace.js  adonisrc.ts        AdonisJS CLI entry and project config
  bin/                       server, console, test entry points
  start/
    kernel.ts                middleware stacks, registered here
    routes.ts                the whole route table
    env.ts                   typed env validation
    validator.ts
  providers/
    app_provider.ts          IoC bindings, and discovery warm-up
    api_provider.ts
  config/
    app.ts auth.ts database.ts cors.ts bodyparser.ts
    encryption.ts hash.ts logger.ts
    gemini.ts                model tiers, sampling, retry, discovery
  app/
    consts.ts
    controllers/             one per resource
    middleware/              auth, silent auth, container bindings, json
    models/                  Lucid models, one per table
    services/
      gemini_service.ts      the only file that talks to Google
    transformers/            response shaping
    validators/              request validation
    exceptions/              gemini_error, the HTTP error handler
  database/
    migrations/              one migration per table
    schema.ts  schema_rules.ts
  tests/bootstrap.ts
```

### Request pipeline

`start/kernel.ts` defines two stacks, and the order is fixed:

**Server stack**, runs on every request even if no route matches:

1. `force_json_response_middleware` - forces a JSON body on API paths
2. `container_bindings_middleware` - binds `HttpContext` and `Logger` so
   controllers can be resolved out of the IoC container
3. `@adonisjs/cors/cors_middleware`

**Router stack**, runs only for a matched route:

1. `@adonisjs/core/bodyparser_middleware` - parses JSON bodies
2. `@adonisjs/auth/initialize_auth_middleware` - sets up `ctx.auth`
3. `silent_auth_middleware` - calls `ctx.auth.check()`, which does not throw

`auth` is a *named* middleware. It is applied per route group rather than
globally, which is what keeps `/health` and the two login routes public.

`server.errorHandler` points at `app/exceptions/handler.ts`, whose `debug` flag
is `!app.inProduction`. In development the client gets stack frames; in
production it does not.

### Route table

Everything is under `/api` except the liveness probe.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | no | liveness, no token needed |
| POST | `/api/auth/register` | no | create an account |
| POST | `/api/auth/login` | no | exchange credentials for a token |
| GET | `/api/auth/me` | yes | current user |
| POST | `/api/auth/logout` | yes | revoke the token |
| GET | `/api/models` | yes | models this key can reach |
| GET | `/api/model-tiers` | yes | same models grouped as named tiers |
| GET | `/api/conversations` | yes | list, newest first, with message counts |
| POST | `/api/conversations` | yes | create, titles itself from the first message |
| GET | `/api/conversations/:id` | yes | one conversation with its messages |
| PATCH | `/api/conversations/:id` | yes | rename |
| DELETE | `/api/conversations/:id` | yes | remove |
| GET | `/api/conversations/:conversationId/messages` | yes | message history |
| POST | `/api/conversations/:conversationId/messages` | yes | buffered send |
| POST | `/api/conversations/:conversationId/messages/stream` | yes | SSE send |

Controllers are referenced through `#generated/controllers`, which holds dynamic
imports. The router resolves each one on first use, so booting the server does
not pull in every controller, model, and transformer at once.

### Ownership

`findOwnedConversation` appears in both `conversations_controller.ts` and
`messages_controller.ts`. It always pairs `.where('userId', userId)` with the id
lookup, so one user can never read or mutate another user's conversations
regardless of which endpoint they hit.

Both copies also call `conversationIdFrom` before querying. Route params arrive
as text while the column is an integer, so `/api/conversations/abc` used to
reach Postgres and come back as a 500 carrying the failed SQL and the driver
error code. The helper range checks against a Postgres integer and throws a
clean `400 E_INVALID_ID` instead.

### Responses

Every endpoint returns through `serialize`, and the serializer is configured to
wrap payloads as `{ "data": ... }`. Transformers are what actually pick fields,
so the shape of a response is defined in `app/transformers/` and nowhere else.

Two transformer notes worth knowing:

- `messages_controller.store` must `await serialize(...)` before `send`. A
  promise is not unwrapped by the response layer and would reach the wire as
  `{}`.
- The stream endpoint uses `serialize.withoutWrapping(...)` because each SSE
  event already carries its own keys.

### Gemini service

`app/services/gemini_service.ts` is the only file that imports
`@google/genai`. It is registered as a container singleton in
`app_provider.register()`, because the client holds a connection pool and the
discovery result is worth paying for once per process rather than per request.

Its public surface is deliberately small:

| Method | Returns | Used by |
| --- | --- | --- |
| `listModels()` | confirmed models, each with a `status` | `GET /api/models` |
| `listTiers()` | `fast` / `reasoning` / `cheap`, each resolved to a model | `GET /api/model-tiers` |
| `defaultModel()` | a model id, resolved live | `prepareTurn` |
| `generateReply()` | `{ model, text }` | buffered endpoint |
| `openStream()` | `{ model, chunks }` | streaming endpoint |

Both `generateReply` and `openStream` return the model that *actually answered*,
which is not always the one requested, because failover may have moved on. The
controllers persist the returned value, never the requested one.

---

## Frontend layout

```
frontend/
  nuxt.config.ts             runtime config, dev port, catch-all route
  app/
    app.vue                  thin shell, just <NuxtPage />
    pages/index.vue          the chat screen, composes everything below
    components/
      AuthPanel.vue          sign in and register
      ChatSidebar.vue        conversation list, new, rename, delete
      ChatMessageItem.vue    one transcript row
      ChatComposer.vue       the input
      ModelPicker.vue        model dropdown
      ErrorBanner.vue        failure notice with a retry
      CatchAllPage.vue       unknown URL
    composables/
      useApi.ts              fetch wrapper, token, data unwrapping
      useToken.ts            token in useState + localStorage
      useAuth.ts             sign in, register, logout, session
      useChat.ts             conversations, messages, streaming
    plugins/auth.client.ts   restores the token before render
    types/api.ts             the shapes the API returns
    utils/errors.ts          ApiError to human message
    assets/css/main.css      theme custom properties
  public/
```

State is split by concern rather than held in one store. `useToken` owns only
the bearer token, `useAuth` owns the user, and `useChat` owns conversations and
messages. `useState` keeps values across navigation, so there is no Pinia and no
plugin-injected singleton.

`pages/index.vue` is the composition point. It calls `useAuth()` and `useChat()`,
then decides which of the two views is on screen: `AuthPanel` when there is no
user, otherwise the sidebar, transcript, picker, and composer together.

### Only two things are public

`nuxt.config.ts` exposes exactly one value to the browser:

```ts
runtimeConfig: {
  public: {
    apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3333',
  },
},
```

Anything under `public` is embedded in the client bundle and readable by anyone
using the app. The Gemini key must never be added there. It lives in
`backend/.env` and is read by the service from the environment.

### Why the catch-all route is declared in config

`nuxt.config.ts` registers a Nuxt module that pushes a `/:pathMatch(.*)` route
onto the page list. The obvious file-based equivalent,
`app/pages/[...slug].vue`, is skipped by Nuxt's page scanner on Windows because
its name contains glob characters, so the route silently never exists. Declaring
the path in config behaves identically on every platform.

---

## Workflow 1: boot

1. `npm run dev --workspace backend` starts `bin/server.ts`.
2. Providers register. `AppProvider.register` binds `GeminiService` as a
   singleton.
3. `AppProvider.boot` calls `container.make(GeminiService)`. This is the whole
   reason model discovery is already running before the first visitor arrives.
   The constructor starts discovery and returns immediately, so boot is not
   delayed.
4. `start/kernel.ts` stacks are installed, `start/routes.ts` builds the route
   table, and the server listens on 3333.
5. The frontend dev server starts on 3000. If 3000 is busy Nuxt silently moves
   to the next free port, which is why `config/cors.ts` tolerates any loopback
   port in development instead of naming one origin.

---

## Workflow 2: authentication

Sign in, from the browser:

1. `AuthPanel` emits, `useAuth` posts `{ email, password }` to
   `/api/auth/login` through `useApi`.
2. `useApi` prefixes `runtimeConfig.public.apiBase`, sets
   `Content-Type: application/json`, and unwraps the `data` envelope.
3. `auth_controller.login` verifies the password hash, creates an access token
   row, returns `{ token, user }`.
4. `useAuth` calls `useToken().setToken`, which writes to `useState` and to
   `localStorage` under `gemini_chatbot.token`.
5. `pages/index.vue` re-renders the chat screen because `isAuthenticated` flipped.

On a later page load, `plugins/auth.client.ts` calls `restoreToken()` before
the app renders, so a refresh keeps the session. It is a `.client` plugin
because `localStorage` does not exist during server rendering.

A bad password returns `400` with `Invalid user credentials`, deliberately not
`401`. The same response covers an unknown email, so the endpoint never confirms
which accounts exist.

Every later request carries `Authorization: Bearer <token>`. The `auth`
middleware calls `ctx.auth.authenticate()`, which throws `E_UNAUTHORIZED` and
becomes a 401 through the error handler.

---

## Workflow 3: loading the model list

1. `useChat.loadModels` GETs `/api/models`.
2. `models_controller.index` calls `gemini.listModels()`.
3. The service returns whatever the registry holds, waiting up to
   `discovery.initialWaitMs` only if nothing usable is confirmed yet. It never
   blocks a chat on discovery.
4. The frontend takes the first entry as its default and calls
   `scheduleModelRefresh`, a single silent 2 second background refetch. It does
   not touch `loadingModels`, so the picker does not flicker.

The reason this is a service at all, and not a constant, is
[Workflow 5](#workflow-5-what-the-model-discovery-decides).

---

## Workflow 4: sending a message (streaming)

The streaming path is the one the interface uses. The buffered path is the same
shape without the events.

**Frontend, `useChat.sendMessage`:**

1. Guard on empty input and on `sending`.
2. If there is no active conversation, `createConversation()` runs first and a
   failure aborts the send.
3. Two optimistic rows are pushed into `messages`: the user text, and an empty
   assistant bubble. Both carry a temporary negative id and `pending: true`.
4. `fetch` is called directly rather than through `useApi`, because the response
   is a stream and the wrapper would consume it as JSON. The bearer token and
   base URL are applied by hand.
5. `readEventStream` parses `data:` frames into three event shapes: `chunk`,
   `done`, and `error`.
   - `chunk` appends to the assistant bubble, so text appears as it is produced.
   - `done` swaps the optimistic row for the persisted message, which is where
     the real id and timestamp arrive.
   - `error` is remembered and rethrown after the stream closes, because the
     response already answered 200 and cannot change status.
6. On success the conversation is re-fetched, which is what picks up the title
   the backend derived from the first message, and the sidebar reloads.
7. On failure the empty placeholder is removed, or marked not-pending if it had
   already received text, and the prompt is kept in `lastFailedPrompt` so the
   error banner can offer to resend it.

**Backend, `messages_controller.stream`:**

1. `storeMessageValidator` checks content is 1 to 32,000 characters after
   trimming, and that model, if given, is at most 128 characters.
2. `prepareTurn` loads the conversation and its messages, then resolves the
   model: request first, then the conversation's stored model, then
   `gemini.defaultModel()`. Nothing is written yet, so a failing upstream call
   cannot leave a user message stranded.
3. The user message is written **up front** so the turn is visible immediately.
4. An async generator drives the response. The Gemini handshake happens inside
   it, which is deliberate: a total failure then surfaces as an `error` event
   and gets cleaned up by the same path as a mid-stream failure.
5. Each chunk becomes `data: {"chunk":"..."}`.
6. On success `persistTurn` writes the assistant message and updates the
   conversation in one transaction, then a `done` event carries the transformed
   message.
7. On any failure the orphaned user message is deleted and an `error` event is
   emitted with the upstream **status** but a generic message. The status is
   what lets the client tell a rate limit apart from an unusable model; the
   upstream detail is not meant for end users.

Response headers set here: `text/event-stream`, `Cache-Control: no-cache,
no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`.

**Atomicity, both paths.** `persistTurn` writes the assistant message and the
conversation metadata inside one transaction, so a conversation can never hold
a user message with no answer. The streaming path compensates by deleting its
up-front user message on failure.

### Error mapping

`utils/errors.ts` turns an `ApiError` into something worth reading, and it needs
a scope. The same status means different things depending on what was being
attempted: a 404 while sending is a retired model, while a 404 while opening a
conversation is a deleted one. The mapper also strips bare `E_*` codes so a
driver error name is never shown as user-facing text.

---

## Workflow 5: what the model discovery decides

This is the part that is not obvious from the folder layout.

`models.list()` returns a **catalog**, not an entitlement check. It advertises
models that a given key cannot call. Observed on this project: all three
`gemini-2.5-*` models are listed and advertise `generateContent`, and every one
of them answers `404 ... is no longer available to new users`. The list endpoint
carries no flag for this, so the only way to know is to make a call.

So discovery runs in four steps:

1. **Read the catalog** and drop non-chat families by name. The list endpoint
   marks image and speech models as text capable, and they answer a text prompt
   with a sound file, so they are matched out by name.
2. **Confirm each survivor** with a real one-token `generateContent`, eight at a
   time, each with a 4 second deadline. A model under load holds the connection
   open before admitting it is busy, which would otherwise let one slow model
   decide how long discovery takes.
3. **Grade the result** into three verdicts:
   - `usable` - answered 200
   - `limited` - 429 or 5xx, a quota state that lifts on its own
   - `unavailable` - 404 or 400, permanent for the life of the key
4. **Cache for 10 minutes.** Long enough not to re-probe on every page load,
   short enough that a model whose quota came back reappears while someone is
   still looking at the picker.

Two consequences fall out of this.

`/api/models` offers `usable` **and** `limited`, with `limited` marked
`status: "rateLimited"`. They are dimmed but selectable, because a 429 resets
and the request is already retried, so the turn is slow rather than broken.
Only `unavailable` is hidden, since for those the restriction is permanent. 13
of the 16 catalog models are offerable; the other 3 are the retired
`gemini-2.5-*` family.

How many of those 13 are `ready` at any moment changes constantly, and that is
the expected behaviour rather than a bug. Observed across one session: 2 ready
and 11 rate limited, then 0 ready and 13 rate limited, then back again. When
nothing is ready the picker falls back to offering the `limited` set, which is
what stops the dropdown from ever going empty.

`config/gemini.ts` defines three tiers, `fast`, `reasoning`, and `cheap`. Each
holds an ordered `prefer` list and a family `match` pattern. A tier resolves to
the first preferred model in the selectable pool, otherwise the best model
matching the family, otherwise the best model the key has at all. The pool is
the `usable` set, or the `limited` set when nothing is usable, so a tier
survives a total quota squeeze. `exact` in the response is `false` when it did
not land on the first choice.

The point of tiers over a fixed map: `gemini-2.5-pro` sits at the head of the
`reasoning` list. While it 404s it is skipped, and it is used automatically if
the key ever regains it. A constant map would have shipped a dead entry. Tier
keys are also accepted anywhere a model id is, so `model: "fast"` on a send
works and persists the concrete model that answered.

Failover sits underneath all of it. A 404, 429, or 5xx during a turn moves to
the next confirmed model instead of failing, and 404 joins that set specifically
so a conversation saved earlier under a since-retired model still works. The
answer to "the capital of Japan" is worth more than the name of the model that
produced it.

---

## Where a change usually belongs

| If you are changing... | It goes in |
| --- | --- |
| a request or response field | `app/validators/` or `app/transformers/` |
| a new endpoint | `start/routes.ts` plus a controller |
| Gemini behaviour, sampling, retry, tiers | `app/services/gemini_service.ts` and `config/gemini.ts` |
| a table | a new migration in `database/migrations/`, never an edited one |
| which models exist | nowhere. That is discovered at runtime on purpose |
| a chat screen region | `pages/index.vue` and a component under `components/` |
| how an error reads | `app/utils/errors.ts`, keyed by status and scope |
| the API base URL | `runtimeConfig.public.apiBase` in `nuxt.config.ts` |
| CORS | `backend/config/cors.ts` |

The last row of the table is the one worth repeating: no model name is written
into application code. `backend/config/gemini.ts` is the only place a model name
appears at all, and even there the entries are preferences that are re-checked
against the key before use.
