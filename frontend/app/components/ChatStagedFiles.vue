<script setup lang="ts">
/**
 * The files staged for the turn that is about to be sent, drawn above the
 * textarea. Each entry can be taken off again before sending, which is
 * why this is a list of controls rather than a static preview strip.
 *
 * The data is the base64 payload already read off disk by the composer,
 * so an image is shown straight from memory and never re-fetched.
 */
const props = defineProps<{
  images: { name: string; mimeType: string; data: string }[]
  pdfs: { name: string; size: number }[]
}>()

const emit = defineEmits<{
  'remove-image': [index: number]
  'remove-pdf': [index: number]
}>()

/** Compact human readable size for a chip: 512 KB, 1.2 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" role="list" aria-label="Files to send">
    <UAvatar
      v-for="(image, index) in props.images"
      :key="`image-${index}`"
      role="listitem"
      :src="`data:${image.mimeType};base64,${image.data}`"
      :alt="image.name"
      size="sm"
      class="rounded-lg ring-1 ring-default"
    >
      <UIcon name="i-lucide-image" />

      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="solid"
        size="xs"
        square
        class="absolute -end-1 -top-1 rounded-full ring-2 ring-inherit bg-inverted"
        :aria-label="`Remove ${image.name}`"
        @click="emit('remove-image', index)"
      />
    </UAvatar>

    <!--
      A plain element rather than a button: the chip is a label, and the
      only control inside it is the remove button. Nesting one button
      inside another is invalid and breaks keyboard use.
    -->
    <div
      v-for="(pdf, index) in props.pdfs"
      :key="`pdf-${index}`"
      role="listitem"
      class="flex items-center gap-1 rounded-lg bg-elevated px-2 py-1 text-xs ring-1 ring-default"
    >
      <UIcon name="i-lucide-file-text" class="size-3.5 text-muted" />
      <span class="max-w-40 truncate text-toned" :title="pdf.name">{{ pdf.name }}</span>
      <span class="text-dimmed">{{ formatBytes(pdf.size) }}</span>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="`Remove ${pdf.name}`"
        @click="emit('remove-pdf', index)"
      />
    </div>
  </div>
</template>
