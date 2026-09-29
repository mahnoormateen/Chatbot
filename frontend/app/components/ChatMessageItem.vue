<script setup lang="ts">
import type { MessageImage } from '~/types/api'
import type { ChatMessage } from '~/composables/useChat'

const props = defineProps<{ message: ChatMessage }>()

const copied = ref(false)

/** Images attached to this message (user turns only in practice). */
const messageImages = computed(() => props.message.images ?? [])

/** Rebuilds the data URI the backend stripped for transport. */
function imageSrc(image: MessageImage): string {
  return `data:${image.mimeType};base64,${image.data}`
}

/**
 * True while this bubble is an optimistic row that has not been replaced
 * by a persisted message yet.
 */
const isPlaceholder = computed(() => 'pending' in props.message)

/**
 * The answer has not produced any text yet, so the waiting indicator
 * stands in for the content.
 */
const isWaiting = computed(
  () => props.message.role === 'assistant' && !props.message.content && isPlaceholder.value
)

/** Text is arriving, so the caret marks the live end of the answer. */
const isStreaming = computed(
  () => props.message.role === 'assistant' && Boolean(props.message.content) && isPlaceholder.value
)

const time = computed(() => {
  const value = new Date(props.message.createdAt)
  return Number.isNaN(value.getTime())
    ? ''
    : value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard access can be denied, the text is still selectable.
  }
}
</script>

<template>
  <article class="message" :class="props.message.role">
    <div class="bubble">
      <div v-if="messageImages.length" class="images">
        <img
          v-for="(image, index) in messageImages"
          :key="index"
          class="thumb"
          :src="imageSrc(image)"
          :alt="`Attached image ${index + 1}`"
          loading="lazy"
        />
      </div>

      <div v-if="isWaiting" class="typing" role="status" aria-label="Gemini is thinking">
        <span /><span /><span />
      </div>

      <p v-else class="content">
        {{ props.message.content }}<span v-if="isStreaming" class="caret" aria-hidden="true" />
      </p>

      <footer v-if="!isWaiting">
        <time :datetime="props.message.createdAt">{{ time }}</time>
        <button
          v-if="props.message.content"
          class="btn-ghost copy"
          type="button"
          :aria-label="copied ? 'Copied' : 'Copy message'"
          @click="copy"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.message {
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.bubble {
  max-width: min(760px, 82%);
  padding: 12px 15px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.message.user .bubble {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

.content {
  margin: 0;
  /* Pre-wrapped so code blocks and line breaks from the model survive. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.thumb {
  max-width: 240px;
  max-height: 180px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--bg-elevated);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-faint);
}

.copy {
  padding: 2px 6px;
  font-size: 11.5px;
  line-height: 1.2;
}

.typing {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  animation: bounce 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing span:nth-child(3) {
  animation-delay: 0.3s;
}

/* Blinking block at the live end of a streaming answer. */
.caret {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  border-radius: 1px;
  background: var(--accent-strong);
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .typing span,
  .caret {
    animation: none;
  }
}

@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
