<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { ApiModel } from '~/types/api'

const props = defineProps<{
  models: ApiModel[]
  /** The model currently selected, mirroring useChat.selectedModel. */
  modelValue: string
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const model = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

/**
 * A model the backend reported as quota limited is still offered, but
 * marked: it answers, it just answers slowly and may fail with a 429
 * until the quota resets. The label is written into the row so the
 * reason is readable rather than being carried by a colour alone.
 */
const items = computed<SelectMenuItem[]>(() =>
  props.models.map((entry) => ({
    label: entry.displayName,
    value: String(entry.id),
    description: entry.description ?? undefined,
    icon: entry.status === 'rateLimited' ? 'i-lucide-clock' : undefined,
    color: entry.status === 'rateLimited' ? 'warning' : undefined,
  }))
)

/**
 * The list arrives over several requests, so the current value is added
 * back if it is not in it yet. Without this the trigger would read as
 * empty in the window between the first response and the full list.
 */
const shownItems = computed<SelectMenuItem[]>(() => {
  const current = model.value
  const exists = items.value.some((item) => {
    if (item !== null && typeof item === 'object' && 'value' in item) return item.value === current
    return item === current
  })
  if (!current || exists) return items.value
  return [{ label: current, value: String(current) }, ...items.value]
})

/** Shown on the closed trigger, so a long display name is still legible. */
const selectedLabel = computed(
  () => props.models.find((entry) => entry.id === model.value)?.displayName ?? model.value
)
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="shownItems"
    :loading="loading"
    :disabled="disabled"
    :placeholder="selectedLabel"
    size="sm"
    variant="ghost"
    color="neutral"
    icon="i-lucide-chevron-down"
    trailing-icon="i-lucide-search"
    :content="{ align: 'start', side: 'top', sideOffset: 8 }"
    class="data-[state=open]:bg-elevated font-medium"
    :ui="{ base: 'data-[state=open]:ring-0 data-[state=open]:bg-transparent' }"
  />
</template>
