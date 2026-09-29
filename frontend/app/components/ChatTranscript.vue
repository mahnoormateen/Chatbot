<script setup lang="ts">
import type { ChatStatus } from '~/composables/useChat'
import type { UiMessage } from '~/utils/uiMessages'
import type { ApiAttachment } from '~/types/api'

/**
 * The transcript.
 *
 * The rows, their scrolling and the "waiting" indicator come from the
 * chat components; everything a row draws is filled in through the slots
 * below, because this app needs three things the defaults do not cover:
 * the document chips stored on a message, the day dividers, and the
 * markdown surface for a reply.
 */
const props = defineProps<{
  messages: UiMessage[]
  status: ChatStatus
  /** Named in the waiting line so it is clear what is being waited on. */
  modelName?: string
  /** Pinned in the header of every row, as the author mark. */
  userInitials?: string
  /** Height of the composer, kept clear of the last row when scrolling. */
  spacingOffset?: number
}>()

const api = useApi()
const { token } = useToken()

/** Message id of the row the copy button last confirmed, for its label. */
const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

/**
 * A divider is drawn above the first row of each day. It rides in the
 * message header, which is the only slot that spans the full width and
 * sits above the bubble, so the transcript needs no separate layout for
 * it and stays in the order the components expect.
 */
const dayDividers = computed(() => {
  const dividers = new Map<string, string>()
  let previousKey = ''

  for (const message of props.messages) {
    const date = new Date(message.metadata.createdAt)
    if (Number.isNaN(date.getTime())) continue

    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    if (key === previousKey) continue

    previousKey = key
    dividers.set(message.id, formatDay(date))
  }

  return dividers
})

/** "Today", "Yesterday", or a short date once it is far enough back. */
function formatDay(date: Date): string {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const day = 86_400_000

  if (date.getTime() >= startOfToday) return 'Today'
  if (date.getTime() >= startOfToday - day) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTime(iso: string): string {
  const value = new Date(iso)
  return Number.isNaN(value.getTime())
    ? ''
    : value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Compact human readable size for a chip: 512 KB, 1.2 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function textOf(message: UiMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

/**
 * A row is mid answer while the backend is still streaming into it. The
 * caret marks the live end so a paused stream is not mistaken for the
 * end of the reply.
 */
function isStreaming(message: UiMessage): boolean {
  return props.status === 'streaming' && message.role === 'assistant' && message.metadata.pending
}

/**
 * Fetches the stored bytes with the bearer token and downloads them as a
 * blob, so a document can be re-opened after it was sent. An optimistic
 * row (attachment id 0, not persisted yet) is not clickable.
 */
async function openAttachment(message: UiMessage, attachment: ApiAttachment) {
  if (!attachment.id || message.metadata.pending) return

  try {
    const response = await fetch(
      api.url(
        `/api/conversations/${message.metadata.conversationId}/messages/${message.id}/attachments/${attachment.id}`
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

async function copy(message: UiMessage) {
  try {
    await navigator.clipboard.writeText(textOf(message))
    copiedId.value = message.id
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copiedId.value = null), 1500)
  } catch {
    // Clipboard access can be denied, the text is still selectable.
  }
}

onScopeDispose(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <UChatMessages
    :messages="props.messages"
    :status="props.status"
    :spacing-offset="props.spacingOffset"
    should-auto-scroll
    class="chat-transcript"
    :user="{ variant: 'soft' }"
    :assistant="{ variant: 'naked' }"
  >
    <!--
      The author mark. The components draw the bubble themselves, so this
      is where the row is told who is speaking.
    -->
    <template #leading="{ message }">
      <UAvatar
        size="sm"
        :alt="message.role === 'assistant' ? 'Gemini' : 'You'"
        :icon="message.role === 'assistant' ? 'i-lucide-sparkles' : undefined"
        :text="message.role === 'assistant' ? undefined : (props.userInitials || '?')"
        :class="message.role === 'assistant' ? 'ring-1 ring-primary/30 text-primary' : 'bg-primary text-inverted'"
      />
    </template>

    <!-- Day divider, drawn above the first row of each day. -->
    <template #header="{ message }">
      <div v-if="dayDividers.get(message.id)" class="flex w-full items-center gap-3 pb-1">
        <USeparator class="flex-1" />
        <span class="text-xs font-medium text-dimmed">{{ dayDividers.get(message.id) }}</span>
        <USeparator class="flex-1" />
      </div>
    </template>

    <!-- Images and documents carried by the row. -->
    <template #files="{ message }">
      <div class="flex flex-wrap items-center gap-2">
        <img
          v-for="(image, index) in message.metadata.images"
          :key="`image-${index}`"
          :src="`data:${image.mimeType};base64,${image.data}`"
          :alt="`Attached image ${index + 1}`"
          loading="lazy"
          class="max-h-40 max-w-56 rounded-lg object-cover ring-1 ring-default"
        >

        <UButton
          v-for="(attachment, index) in message.metadata.attachments"
          :key="attachment.id || `local-${index}`"
          color="neutral"
          variant="subtle"
          size="xs"
          :disabled="!attachment.id || message.metadata.pending"
          class="max-w-64"
          :ui="{ base: 'gap-1.5', label: 'truncate' }"
          :title="attachment.id ? 'Open document' : 'Uploading'"
          @click="openAttachment(message, attachment)"
        >
          <template #leading>
            <UBadge label="PDF" color="primary" variant="subtle" size="sm" />
          </template>

          {{ attachment.name }}

          <template #trailing>
            <span class="ms-1 text-dimmed">{{ formatBytes(attachment.size) }}</span>
          </template>
        </UButton>
      </div>
    </template>

    <!--
      Replies are markdown, questions stay as typed. The soft variant
      wraps the user side, so it is also given room to break long lines.
    -->
    <template #content="{ message }">
      <div v-if="message.role === 'assistant'" class="flex flex-col items-start">
        <ChatRichText :text="textOf(message)" />
        <span v-if="isStreaming(message)" class="caret mt-1.5" aria-hidden="true" />
      </div>

      <p v-else class="whitespace-pre-wrap break-words">
        {{ textOf(message) }}<span v-if="isStreaming(message)" class="caret" aria-hidden="true" />
      </p>
    </template>

    <template #actions="{ message }">
      <div class="flex items-center gap-1 rounded-lg bg-default/80 px-1 text-dimmed backdrop-blur-sm">
        <time :datetime="message.metadata.createdAt" class="px-1 text-xs tabular-nums">
          {{ formatTime(message.metadata.createdAt) }}
        </time>

        <UButton
          v-if="textOf(message)"
          :icon="copiedId === message.id ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="copiedId === message.id ? 'Copied' : 'Copy message'"
          @click="copy(message)"
        />
      </div>
    </template>

    <template #indicator>
      <UChatShimmer
        v-if="props.status === 'submitted'"
        :text="`${props.modelName || 'Gemini'} is thinking`"
        class="text-sm"
      />
    </template>
  </UChatMessages>
</template>
