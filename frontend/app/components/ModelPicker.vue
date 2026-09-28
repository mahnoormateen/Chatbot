<script setup lang="ts">
/**
 * Dropdown of the Gemini models the backend key can reach. The value is
 * just a model id, the backend owns which model is actually used.
 *
 * Models the key is currently over quota on are included and marked,
 * because the limit resets on its own. Dropping them would make a model
 * that works an hour from now look like it never existed.
 */
const props = defineProps<{
  models: Array<{
    id: string
    displayName: string
    description?: string | null
    status?: 'ready' | 'rateLimited'
  }>
  modelValue: string
  disabled?: boolean
  /** Shown while the model list is being fetched. */
  loading?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const selected = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

/**
 * An empty list is ambiguous: it is either still loading or a failed
 * request. The label tells the two apart so the control is not just a
 * dead dropdown.
 */
const placeholder = computed(() => {
  if (props.loading) return 'Loading models...'
  return 'No models available'
})

const isLimited = (model: { status?: string }) => model.status === 'rateLimited'
</script>

<template>
  <div class="picker">
    <label class="sr-only" for="model-picker">Model</label>
    <select
      id="model-picker"
      v-model="selected"
      :disabled="props.disabled || props.loading || !props.models.length"
    >
      <option v-if="!props.models.length" value="">{{ placeholder }}</option>
      <option
        v-for="model in props.models"
        :key="model.id"
        :value="model.id"
        :data-limited="isLimited(model) || undefined"
      >
        {{ model.displayName }}{{ isLimited(model) ? ' - rate limited' : '' }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.picker select {
  max-width: 260px;
  padding: 7px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-raised);
  color: var(--text);
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.picker select:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.picker select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

/**
 * Limited options are dimmed, not disabled: a disabled option cannot be
 * chosen, which would defeat the point of offering a model whose quota is
 * expected to return.
 */
.picker option[data-limited] {
  color: var(--text-muted);
}
</style>
