<script setup lang="ts">
/**
 * Rendered for any URL that does not match a page.
 *
 * The route is registered from nuxt.config.ts rather than by a
 * "[...slug].vue" file, because Nuxt's page scanner silently skips a
 * file whose name contains glob characters such as "[", at least on
 * Windows, so the route would never exist. Registering the path
 * directly keeps the behaviour identical everywhere and makes the
 * intent obvious in one place.
 *
 * Without a catch-all, vue-router has nothing to resolve an unknown
 * path and logs a "No match found for location" warning while
 * rendering on the server. That noise is easy to ignore right up to
 * the point where it hides a genuine routing mistake, and a liveness
 * probe aimed at the wrong port turns into a permanent warning: the
 * "/health" endpoint belongs to the AdonisJS API, not to this app.
 */
const route = useRoute()

/**
 * The path that was asked for, shown so a typo is easy to spot.
 */
const attemptedPath = computed(() => route.fullPath)
</script>

<template>
  <div class="not-found">
    <p class="code" aria-hidden="true">404</p>

    <h1>Page not found</h1>

    <p class="detail">
      Nothing is served at <code class="path">{{ attemptedPath }}</code
      >. It may have been mistyped, or the conversation behind it was deleted.
    </p>

    <UButton color="primary" variant="solid" to="/" label="Back to the chat" />
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.code {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--ui-text-dimmed);
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.detail {
  margin: 0 0 6px;
  max-width: 44ch;
  font-size: 14px;
  color: var(--ui-text-muted);
}

.path {
  padding: 1px 5px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-size: 13px;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}
</style>