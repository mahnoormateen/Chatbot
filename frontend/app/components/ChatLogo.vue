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
  <div class="flex items-center gap-2">
    <span
      class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-inverted"
    >
      <UIcon name="i-lucide-bot" class="size-5 text-white" />
    </span>
    <span v-if="!compact" class="truncate text-sm font-semibold text-highlighted">
      Gemini Chat
    </span>
  </div>
</template>
