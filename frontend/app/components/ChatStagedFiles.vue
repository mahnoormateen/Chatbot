<script setup lang="ts">
import type { StagedImage, StagedPdf } from '~/types/composer'

/**
 * The attachments waiting on the next turn, shown as a strip above the
 * text field.
 *
 * Images get a real thumbnail so three photos can be told apart, and
 * documents get a chip with their name and size. Both carry a remove
 * button, because a mis-drop should cost one click rather than a trip
 * back to the file system.
 *
 * The strip is a plain flex row rather than a card: the prompt already
 * draws the container, and a second border inside it reads as a mistake.
 */
const props = defineProps<{
  images: StagedImage[]
  pdfs: StagedPdf[]
}>()

const emit = defineEmits<{
  'remove-image': [index: number]
  'remove-pdf': [index: number]
}>()

/** "1.4 MB", rounded to whatever a person would say out loud. */
function readable(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    v-if="props.images.length || props.pdfs.length"
    class="flex flex-wrap items-center gap-1.5"
  >
    <div
      v-for="(image, index) in props.images"
      :key="image.key"
      class="group/image relative"
    >
      <img
        :src="image.src"
        :alt="image.name"
        class="size-16 rounded-lg object-cover ring-1 ring-default"
      >
      <UButton
        :icon="'i-lucide-x'"
        color="neutral"
        variant="solid"
        size="xs"
        class="absolute -top-1.5 -right-1.5 transition-opacity group-hover/image:opacity-100 focus-visible:opacity-100"
        :aria-label="`Remove ${image.name}`"
        @click="emit('remove-image', index)"
      />
    </div>

    <UButton
      v-for="(pdf, index) in props.pdfs"
      :key="pdf.key"
      color="neutral"
      variant="soft"
      size="sm"
      class="max-w-56 gap-1.5 rounded-lg py-1.5"
      @click="emit('remove-pdf', index)"
    >
      <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-rose-500" />
      <span class="truncate text-xs">{{ pdf.name }}</span>
      <span class="shrink-0 text-xs text-dimmed">{{ readable(pdf.size) }}</span>
      <UIcon name="i-lucide-x" class="size-3.5 shrink-0 text-dimmed" />
      <span class="sr-only">Remove {{ pdf.name }}</span>
    </UButton>
  </div>
</template>
