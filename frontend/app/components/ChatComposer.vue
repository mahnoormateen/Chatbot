<script setup lang="ts">
import type { SendPhase } from '~/composables/useChat'

const props = defineProps<{
  sending: boolean
  /** "thinking" before the first token, "writing" while it streams. */
  phase?: SendPhase
  /** Named in the status line so it is clear what is being waited on. */
  model?: string
}>()

const emit = defineEmits<{ send: [content: string] }>()

const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

/** Short label for the in flight turn. */
const statusLabel = computed(() => {
  if (!props.sending) return ''
  const model = props.model?.trim()
  const subject = model ? model : 'Gemini'
  return props.phase === 'writing' ? `${subject} is writing` : `${subject} is thinking`
})

/** Grows with the content up to a cap, then scrolls inside the box. */
function autoGrow() {
  const element = textarea.value
  if (!element) return

  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 200)}px`
}

const canSend = computed(() => draft.value.trim().length > 0 && !props.sending)

function submit() {
  if (!canSend.value) return

  emit('send', draft.value.trim())
  draft.value = ''

  // Clear the box and shrink it back before the next message streams in.
  nextTick(() => {
    autoGrow()
    textarea.value?.focus()
  })
}

/** Enter sends, Shift+Enter inserts a newline. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}

onMounted(autoGrow)
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      ref="textarea"
      v-model="draft"
      class="input"
      rows="1"
      :disabled="props.sending"
      placeholder="Ask Gemini anything..."
      aria-label="Message"
      @input="autoGrow"
      @keydown="onKeydown"
    />

    <div class="bar">
      <span v-if="statusLabel" class="status" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true" />
        {{ statusLabel }}
      </span>

      <span v-else class="hint">Enter to send | Shift+Enter for a new line</span>

      <button class="btn btn-primary send" type="submit" :disabled="!canSend">
        <span v-if="props.sending" class="spinner" aria-hidden="true" />
        <span v-else>Send</span>
      </button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);
}

.input {
  width: 100%;
  max-height: 200px;
  padding: 4px;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  font-size: 15px;
  line-height: 1.6;
  overflow-y: auto;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hint {
  font-size: 11.5px;
  color: var(--text-faint);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.send {
  min-width: 84px;
}

@media (max-width: 640px) {
  .hint {
    display: none;
  }
}
</style>
