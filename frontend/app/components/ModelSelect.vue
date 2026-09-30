<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { ApiModel } from '~/types/api'

const props = defineProps<{
  models: ApiModel[]
  modelValue: string
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const model = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const items = computed<SelectMenuItem[]>(() =>
  props.models.map((entry) => ({
    label: entry.displayName,
    value: String(entry.id),
    description: entry.description ?? undefined,
    icon: entry.status === 'rateLimited' ? 'i-lucide-clock' : undefined,
    color: entry.status === 'rateLimited' ? 'warning' : undefined,
  }))
)

const shownItems = computed<SelectMenuItem[]>(() => {
  const current = model.value
  const exists = items.value.some((item) => {
    if (item !== null && typeof item === 'object' && 'value' in item) return item.value === current
    return item === current
  })
  if (!current || exists) return items.value
  return [{ label: current, value: String(current) }, ...items.value]
})

const selectedLabel = computed(
  () => props.models.find((entry) => entry.id === model.value)?.displayName ?? model.value
)
</script>

<template>
  <!--
    valueKey is required. Without it USelectMenu compares each whole
    object against the selected string, never matches, and falls back to
    printing the raw model id instead of the display name.
  -->
  <USelectMenu
    v-model="model"
    :items="shownItems"
    value-key="value"
    :loading="loading"
    :disabled="disabled"
    :placeholder="selectedLabel"
    size="sm"
    variant="ghost"
    color="neutral"
    :content="{ align: 'start', side: 'top', sideOffset: 8 }"
    class="data-[state=open]:bg-elevated font-medium"
    :ui="{ base: 'data-[state=open]:ring-0 data-[state=open]:bg-transparent' }"
  />
</template>