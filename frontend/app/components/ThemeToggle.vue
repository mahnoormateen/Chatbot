<script setup lang="ts">
/**
 * Switches between the light and dark palettes.
 *
 * Both icons are rendered and the stylesheet picks one from the
 * data-theme attribute on <html>. The server does not know the
 * visitor's preference, so anything derived from it in the template
 * would be rewritten during hydration; selecting with CSS keeps the
 * rendered markup identical on both sides.
 */
const { toggle } = useTheme()
</script>

<template>
  <button
    class="btn-ghost theme-toggle"
    type="button"
    title="Switch theme"
    @click="toggle"
  >
    <!-- Shown while dark, offering the move to light. -->
    <svg
      class="to-light"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>

    <!-- Shown while light, offering the move to dark. -->
    <svg
      class="to-dark"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>

    <span class="sr-only">Switch between light and dark theme</span>
  </button>
</template>

<style scoped>
/* Icon visibility lives in assets/css/main.css, where the :root
   selector can reach the theme attribute without escaping the scoped
   style's data attribute. */
</style>
