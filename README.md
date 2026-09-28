# Gemini Chatbot

A chat interface for the Gemini API. An AdonisJS backend owns the API key,
persists conversations in PostgreSQL, and issues bearer tokens; a Nuxt
frontend provides the assistant interface with a model picker.

The browser never sees the Gemini key. Every call goes through the backend.

```
frontend (Nuxt, :3000)  ──HTTP──▶  backend (AdonisJS, :3333)  ──HTTPS──▶  Gemini API
                                              │
                                              └──▶  PostgreSQL (:5433)
```

## Requirements

- Node.js 20+ and npm 10+
- PostgreSQL 14+ running locally

## Setup

Install both workspaces from the repository root:

```bash
npm install
```

Configure the backend. Create `backend/.env` from `backend/.env.example` and
fill in your key:

```env
PORT=3333
HOST=localhost
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5433
DB_USER=gemini_chatbot
DB_PASSWORD=gemini_dev_pw
DB_DATABASE=gemini_chatbot

GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-flash-latest

# Comma separated list of origins allowed to call the API.
# Leave unset to allow the Nuxt dev server.
# CORS_ORIGIN=http://localhost:3000
```

Create the database and run the migrations:

```bash
npm run migrate
```

## Running

```bash
npm run dev
```

This starts the API on `http://localhost:3333` and the interface on
`http://localhost:3000`. Register an account from the sign-in screen and
start asking questions.

To run them separately:

```bash
npm run dev:api
npm run dev:web
```

Point the frontend at a different API with `NUXT_PUBLIC_API_BASE`:

```bash
NUXT_PUBLIC_API_BASE=https://api.example.com npm run dev:web
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and interface together |
| `npm run build` | Production build of both |
| `npm run typecheck` | `tsc --noEmit` across both |
| `npm run lint` | ESLint (backend) |
| `npm run test` | Backend test suite |
| `npm run migrate` | Run pending migrations |
| `npm run codegen` | Regenerate AdonisJS types |

## API

Every successful response is wrapped in a `data` key. Endpoints other than
registration, login, and health need `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `POST` | `/api/auth/register` | Create an account, returns a token |
| `POST` | `/api/auth/login` | Exchange credentials for a token |
| `GET` | `/api/auth/me` | The signed in user |
| `POST` | `/api/auth/logout` | Revoke the current token |
| `GET` | `/api/models` | Gemini models this key can reach |
| `GET` | `/api/conversations` | Your conversations, newest first |
| `POST` | `/api/conversations` | Start a conversation |
| `GET` | `/api/conversations/:id` | One conversation with its messages |
| `PATCH` | `/api/conversations/:id` | Rename a conversation |
| `DELETE` | `/api/conversations/:id` | Delete a conversation |
| `GET` | `/api/conversations/:id/messages` | The transcript |
| `POST` | `/api/conversations/:id/messages` | Send a message, get the full reply |
| `POST` | `/api/conversations/:id/messages/stream` | Same, streamed over SSE |

`GET /api/models` and the two read endpoints are open; conversation and
message routes are scoped to the owner, so another user's ids return 404.

### Streaming

`POST /api/conversations/:id/messages/stream` returns `text/event-stream`:

```
data: {"chunk":"Hel"}
data: {"chunk":"lo"}
data: {"done":true,"model":"gemini-flash-latest","message":{...}}
```

A failure arrives as `data: {"error":"...","status":429}` before the stream
closes. The `status` is the upstream one, so the client can tell a rate
limit apart from an unusable model and say something useful.

## Interface behaviour

**Waiting is visible.** Sending a message puts a placeholder bubble in the
transcript with an animated indicator while Gemini produces nothing, then a
blinking caret at the end of the text as it streams in. A status line above
the composer names the model and says whether it is thinking or writing. The
transcript and the model dropdown both show a shimmer placeholder while
loading, so a slow first paint is distinguishable from an empty list.

**Failures are explained, not dumped.** The backend bodies are not user
facing — a missing conversation arrives as Lucid's `Row not found`, a rate
limit as `Gemini could not complete the request` — so the frontend maps the
status to a title and an actionable sentence. A rate limit says the quota is
spent rather than suggesting a different model, because the backend has
already tried its fallbacks by then. A 404 while sending reports the model as
unavailable, while the same status while reading reports a missing
conversation. Validation errors are listed per field. The banner is
dismissible, and for a failed turn it offers to resend the question.

**Reduced motion is respected.** The indicator, caret and shimmer all stop
animating under `prefers-reduced-motion`.

## Behaviour worth knowing

**Turns are stored atomically.** The backend asks Gemini first and writes
the user message and the reply in one transaction. A failed call leaves the
conversation exactly as it was, so a transcript can never contain a question
with no answer. The streaming endpoint writes the question up front so it is
visible while the answer is produced, and deletes it if the stream fails.

**Rate limits are retried.** Requests that fail with 429 or 5xx are retried
three times with a short linear backoff. A real upstream 4xx is passed
through with its own status instead of being flattened into a 502, so quota
problems stay distinguishable from bad requests.

**Titles come from the first message.** A new conversation is titled from
its opening message, truncated to 60 characters.

**Model list has a fallback.** If the Gemini models endpoint is unreachable,
`GET /api/models` serves a small static list so the picker still works.

## Layout

```
backend/
  app/
    controllers/    auth, conversations, messages, models, health
    models/         User, Conversation, Message
    services/       gemini_service.ts — the only Gemini wrapper
    transformers/   response shaping for the data envelope
    validators/     request validation
  config/           auth, database, cors, gemini
  database/         migrations and generated schema
  start/routes.ts   the route table
frontend/
  app/
    components/     chat interface pieces
    composables/    useApi, useAuth, useChat, useToken
    pages/          index.vue
    types/          API response shapes
```

The backend reaches Gemini only through
`backend/app/services/gemini_service.ts`. Model listing, generation,
streaming, retries, and error mapping are all in that one file, so upstream
changes have a single place to land.

## Troubleshooting

**`429` on every message.** The key is out of quota for that model. Pick a
different one in the picker, or check billing at
<https://ai.google.dev/gemini-api/docs/rate-limits>.

**`404` from Gemini on a specific model.** Older models are retired for new
users. `GET /api/models` only lists what the key can actually call.

**Frontend cannot reach the API.** Set `CORS_ORIGIN` in `backend/.env` to
the origin you are loading the page from, or leave it unset for local
development.

**Database connection refused.** Confirm PostgreSQL is on the port in
`DB_PORT` and that the role and database from `backend/.env` exist.
