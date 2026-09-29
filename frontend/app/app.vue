<script setup lang="ts">
/**
 * Root shell of the app.
 *
 * UApp owns everything that needs to be mounted exactly once for the
 * whole document: the toast and tooltip providers, the overlays, and
 * the colour mode script that puts the saved palette on <html> before
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
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
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
