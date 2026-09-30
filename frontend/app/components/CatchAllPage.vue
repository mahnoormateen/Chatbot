<script setup lang="ts">
/**
 * Rendered for any URL that does not match a page.
 *
 * The route is registered from nuxt.config.ts rather than by a
 * "[...slug].vue" file, because Nuxt's page scanner silently skips a
 * file whose name contains glob characters such as "[", at least on
 * Windows, so the route would never exist. Registering the path
 * directly keeps the behavior identical everywhere and makes the
 * intent obvious in one place.
 *
 * Without a catch-all, vue-router has nothing to resolve an unknown
 * path and logs a "No match found for location" warning while
 * rendering on the server. That noise is easy to ignore right up to
 * the point where it hides a genuine routing mistake, and a liveness
 * probe aimed at the wrong port turns into a permanent warning: the
 * "/health" endpoint belongs to the AdonisJS API, not to this app.
 *
 * UError is given the pieces by slot rather than an "error" object,
 * because this is not a thrown Nuxt error. It is a normal 200 response
 * for a page that happens to say the address is unknown, and the path
 * is worth repeating so a mistyped URL is easy to spot.
 */
const route = useRoute()

const attemptedPath = computed(() => route.fullPath)
</script>

<template>
  <UError icon="i-lucide-file-question" :ui="{ root: 'min-h-svh px-6' }">
    <template #statusCode>404</template>

    <template #statusMessage>Page not found</template>

    <template #message>
      Nothing is served at
      <code class="font-mono text-highlighted">{{ attemptedPath }}</code
      >. It may have been mistyped, or the conversation behind it was deleted.
    </template>

    <template #links>
      <UButton to="/" size="lg" color="primary" label="Back to the chat" />
    </template>
  </UError>
</template>
