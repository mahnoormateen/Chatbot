<script setup lang="ts">
import type { FriendlyError } from '~/utils/errors'

const props = defineProps<{
  error: FriendlyError
  /** Shows a "Try again" button when the failure is worth repeating. */
  retryable?: boolean
  retryLabel?: string
}>()

const emit = defineEmits<{ dismiss: []; retry: [] }>()
</script>

<template>
  <UAlert
    color="error"
    variant="soft"
    icon="i-lucide-circle-alert"
    :title="props.error.title"
    :description="props.error.detail"
    :close="true"
    @close="emit('dismiss')"
  >
    <template v-if="props.error.items.length" #description>
      <div>
        <p>{{ props.error.detail }}</p>
        <ul class="mt-1 list-disc pl-4">
          <li v-for="item in props.error.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </template>

    <template v-if="props.retryable" #actions>
      <UButton
        color="error"
        variant="soft"
        size="sm"
        @click="emit('retry')"
      >
        {{ props.retryLabel ?? 'Try again' }}
      </UButton>
    </template>
  </UAlert>
</template>