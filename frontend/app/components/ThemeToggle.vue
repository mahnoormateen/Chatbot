<script setup lang="ts">
/**
 * Switches between the light and dark palettes.
 *
 * The colour mode module owns the state; this button only toggles it and
 * shows the icon for the mode that would be entered, so the control reads
 * as "switch to light" while dark and vice versa.
 *
 * The composable comes from @nuxtjs/color-mode, which @nuxt/ui installs
 * and configures; the useColorMode exported by @nuxt/ui itself is a stub.
 */
const colorMode = useColorMode()

const isDark = computed(() => colorMode.value === 'dark')

function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <UButton
    :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    @click="toggle"
  />
</template>