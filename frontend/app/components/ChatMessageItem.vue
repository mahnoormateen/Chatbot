<script setup lang="ts">
import type { ApiAttachment, MessageImage } from '~/types/api'
import type { ChatMessage } from '~/composables/useChat'

const props = defineProps<{
  message: ChatMessage
  /** Shown inside the user avatar, taken from the signed in account. */
  userInitials?: string
}>()

const copied = ref(false)

/** Images attached to this message (user turns only in practice). */
const messageImages = computed(() => props.message.images ?? [])

/** Documents stored with this message, optimistic placeholder provided. */
const messageAttachments = computed(() => props.message.attachments ?? [])

/** Rebuilds the data URI the backend stripped for transport. */
function imageSrc(image: MessageImage): string {
  return `data:${image.mimeType};base64,${image.data}`
}

/**
 * Fetches the stored bytes with the bearer token and downloads them as a
 * blob, so the document can be re-opened after it was sent. Optimistic
 * rows (id 0, no backend id yet) are not clickable.
 */
async function openAttachment(attachment: ApiAttachment) {
  if (!attachment.id || 'pending' in props.message) return

  const api = useApi()
  const { token } = useToken()

  try {
    const response = await fetch(
      api.url(
        `/api/conversations/${props.message.conversationId}/messages/${props.message.id}/attachments/${attachment.id}`
      ),
      { headers: token.value ? { Authorization: `Bearer ${token.value}` } : {} }
    )
    if (!response.ok) return

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = attachment.name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch {
    // Opening the stored file is best effort; the chip stays visible.
  }
}

/** Compact human readable size for a chip: 512 KB, 1.2 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

/** Replies render as markdown; questions stay plain with line breaks. */
const isAssistant = computed(() => props.message.role === 'assistant')

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
    <div class="avatar" :class="props.message.role" aria-hidden="true">
      <template v-if="isAssistant">
        <!-- Four-point sparkle standing for Gemini. -->
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          stroke="none"
        >
          <path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10Z" />
        </svg>
      </template>
      <span v-else>{{ userInitials || '·' }}</span>
    </div>

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

      <div v-if="messageAttachments.length" class="attachments">
        <button
          v-for="(attachment, index) in messageAttachments"
          :key="attachment.id || `local-${index}`"
          class="chip"
          type="button"
          :disabled="!attachment.id"
          :aria-label="attachment.id ? `Open ${attachment.name}` : attachment.name"
          :title="attachment.id ? 'Open document' : undefined"
          @click="openAttachment(attachment)"
        >
          <span class="badge" aria-hidden="true">PDF</span>
          <span class="name">{{ attachment.name }}</span>
          <span class="size">{{ formatBytes(attachment.size) }}</span>
        </button>
      </div>

      <div v-if="isWaiting" class="typing" role="status" aria-label="Gemini is thinking">
        <span /><span /><span />
      </div>

      <div v-else class="body">
        <ChatRichText v-if="isAssistant && props.message.content" :text="props.message.content" />
        <p v-else class="content">
          {{ props.message.content }}<span v-if="isStreaming" class="caret" aria-hidden="true" />
        </p>
        <span v-if="isStreaming && isAssistant" class="caret block" aria-hidden="true" />
      </div>

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
  align-items: flex-start;
  gap: 12px;
  animation: message-in 0.22s ease both;
}

.message.user {
  flex-direction: row-reverse;
}

/* The author mark: initials for the user, a sparkle for the assistant. */
.avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-fg);
  background: var(--accent);
}

.message.assistant .avatar {
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent-strong);
}

.bubble {
  max-width: min(720px, calc(100% - 58px));
  padding: 12px 15px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.message.user .bubble {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

/* Assistant bubbles sit flush against their avatar; user bubbles point
   away, giving the row the familiar chat layout without tail arrows. */
.message.assistant .bubble {
  border-top-left-radius: 6px;
}

.message.user .bubble {
  border-top-right-radius: 6px;
}

.content {
  margin: 0;
  /* Pre-wrapped so code blocks and line breaks from the model survive. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.body {
  display: flex;
  flex-direction: column;
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

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}

.chip:disabled {
  cursor: default;
}

.badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  flex: none;
  color: var(--text-faint);
  font-size: 11px;
}

footer {
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

/* Streaming replies are markdown: the caret sits on its own line. */
.caret.block {
  margin-top: 6px;
  align-self: flex-start;
  flex: none;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes blink {
  50% {
    opacity: 0;
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

@media (prefers-reduced-motion: reduce) {
  .typing span,
  .caret,
  .message {
    animation: none;
  }
}
</style>