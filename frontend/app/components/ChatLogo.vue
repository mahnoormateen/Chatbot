<script setup lang="ts">
/**
 * The app mark shown at the top of the sidebar and on the signed out
 * screen. Drawn with an icon rather than a bespoke SVG so it inherits the
 * active color from the theme instead of carrying a fixed palette.
 */
defineProps<{
  /** Hides the wordmark, leaving just the mark for a collapsed rail. */
  compact?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2.5">
    <!--
      A gradient, a ring and a shadow rather than a flat square of the
      accent. The mark is the one piece of branding on the signed out
      screen, where it has no surrounding chrome to sit in, so it carries
      more of the visual weight on its own.
    -->
    <span
      class="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary from-40% to-primary/70 text-primary-inverted shadow-sm ring-1 ring-primary/20"
    >
      <UIcon name="i-lucide-bot" class="size-5 text-white" />
    </span>
    <span v-if="!compact" class="truncate text-sm font-semibold text-highlighted">
      Gemini Chat
    </span>
  </div>
</template>
