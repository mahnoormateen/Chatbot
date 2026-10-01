<script setup lang="ts">
/**
 * Root shell of the app.
 *
 * UApp owns everything that needs to be mounted exactly once for the
 * whole document: the toast and tooltip providers, the overlays, and
 * the color mode script that puts the saved palette on <html> before
 * the first paint. Any component rendered outside of it falls back to
 * its own defaults, so this is not optional.
 */
const colorMode = useColorMode()

/**
 * Feeds the browser chrome (the mobile status bar, the address bar) the
 * same background the page is painted with, so switching colour mode
 * does not leave a mismatched strip at the top of the screen.
 */
const themeColor = computed(() =>
  colorMode.value === 'dark' ? '#18181b' : '#ffffff'
)

useHead({
  meta: [
    { charset: 'utf-8' },
    {
      name: 'viewport',
      /**
       * Two mobile-only opt-ins, both ignored by desktop browsers.
       *
       * "viewport-fit=cover" lets the layout reach under the rounded
       * corners and the home indicator. It is also the switch that makes
       * env(safe-area-inset-*) report anything other than zero: without
       * it every inset in main.css resolves to 0px and the padding they
       * feed is silently dead. The cost is that the app is then responsible
       * for staying out of the unsafe edges itself, which is what the
       * --safe-* variables are for.
       *
       * "interactive-widget=resizes-content" asks the browser to shrink
       * the layout viewport when the on-screen keyboard opens. It matters
       * here because the shell is "fixed inset-0": nothing in the document
       * scrolls, so without this the keyboard simply covers the composer.
       * Chrome and Android honour it; iOS ignores it and no meta tag can
       * change that, so the composer is still the last thing to go under
       * the keyboard on a Safari phone.
       */
      content:
        'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
    },
    { key: 'theme-color', name: 'theme-color', content: themeColor },
  ],
  htmlAttrs: {
    lang: 'en',
  },
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }" :tooltip="{ delayDuration: 200 }">
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator color="var(--ui-primary)" />

    <NuxtPage />
  </UApp>
</template>
