# Gemini Chat — frontend

The Nuxt client. It renders the chat interface, holds the bearer token, and
calls the AdonisJS API for everything else — the Gemini API key is never
sent to the browser.

See the [root README](../README.md) for setup, scripts and the API
reference.

## Layout

```
app/
  app.vue          root shell, renders the page
  pages/index.vue  the interface: sidebar, transcript, composer
  components/      chat pieces (auth, sidebar, messages, composer, picker)
  composables/     useApi, useAuth, useChat, useToken
  types/api.ts     response shapes returned by the backend
  assets/css/      design tokens and shared primitives
```

## How a message is sent

`useChat().sendMessage` pushes the question and an empty answer bubble
immediately, then streams from
`POST /api/conversations/:id/messages/stream` and fills the bubble chunk by
chunk. Once the backend reports the turn is stored, the optimistic rows are
replaced with what was actually persisted. A failure drops the placeholder
and reconciles against the server rather than guessing.

## Configuration

`NUXT_PUBLIC_API_BASE` sets the backend base URL. It defaults to
`http://localhost:3333`.

Do not add the Gemini API key to `runtimeConfig` or any `public` value:
everything there is compiled into the client bundle.
