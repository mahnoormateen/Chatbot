<script setup lang="ts">
import type { FriendlyError } from '~/utils/errors'
import type { ButtonProps } from '@nuxt/ui'

/**
 * Surfaces a failure above the composer.
 *
 * The wording comes from toFriendlyError, which has already turned a
 * status code or a Lucid internal into something a person can act on, so
 * this component only decides how to lay it out: a headline, the
 * explanation, and a per field list when the backend rejected a form.
 *
 * "Try again" appears only when a prompt is still held for resending.
 * A stop is deliberately not an error, so it never reaches here.
 */
const props = defineProps<{
  error: FriendlyError
  /** Whether resending the failed turn is possible right now. */
  retryable?: boolean
}>()

const emit = defineEmits<{ dismiss: []; retry: [] }>()

/** A validation failure lists its problems, anything else is one sentence. */
const list = computed(() => props.error.items)

const actions = computed<ButtonProps[]>(() =>
  props.retryable
    ? [
        {
          label: 'Try again',
          color: 'error',
          variant: 'solid',
        },
      ]
    : []
)
</script>

<template>
  <UAlert
    :title="error.title"
    :description="list.length ? undefined : error.detail"
    icon="i-lucide-triangle-alert"
    color="error"
    variant="soft"
    :actions="actions"
    close
    class="mx-2.5"
    @update:open="emit('dismiss')"
  >
    <template v-if="list.length" #description>
      <ul class="mt-1 list-disc space-y-0.5 ps-4">
        <li v-for="item in list" :key="item">
          {{ item }}
        </li>
      </ul>
    </template>
  </UAlert>
</template>
