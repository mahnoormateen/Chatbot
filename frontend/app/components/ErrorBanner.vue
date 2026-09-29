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
  <div class="banner" role="alert">
    <span class="icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </svg>
    </span>

    <div class="body">
      <p class="title">{{ props.error.title }}</p>
      <p class="detail">{{ props.error.detail }}</p>

      <ul v-if="props.error.items.length" class="items">
        <li v-for="item in props.error.items" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div class="actions">
      <button
        v-if="props.retryable"
        class="btn-ghost"
        type="button"
        @click="emit('retry')"
      >
        {{ props.retryLabel ?? 'Try again' }}
      </button>

      <button
        class="btn-ghost dismiss"
        type="button"
        aria-label="Dismiss this message"
        @click="emit('dismiss')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--danger-border);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13.5px;
  line-height: 1.5;
}

.icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.body {
  flex: 1;
  min-width: 0;
}

.title {
  margin: 0;
  font-weight: 600;
}

.detail {
  margin: 2px 0 0;
  color: var(--text-muted);
}

.items {
  margin: 6px 0 0;
  padding-left: 16px;
  color: var(--text-muted);
}

.items li + li {
  margin-top: 2px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.dismiss {
  padding: 4px;
  color: var(--text-faint);
}

.dismiss:hover {
  color: var(--danger);
}
</style>
