<script setup lang="ts">
import type { ChatStatus } from '~/composables/useChat'
import type { UiMessage, UiFilePart, UiTextPart } from '~/utils/uiMessages'

/**
 * The conversation, rendered with UChatMessages.
 *
 * The transcript is a list of parts rather than a single string, so
 * images and documents sit alongside the prose of the same turn instead
 * of being bolted on afterwards. The adapter that turns the API rows
 * into that shape lives in utils/uiMessages.
 *
 * UChatMessages is not the scroll container: it finds the nearest
 * scrollable ancestor on mount and drives that. The caller therefore
 * wraps this in the element that actually scrolls.
 */
const props = defineProps<{
  messages: UiMessage[]
  status: ChatStatus
  /** Named in the thinking indicator, so the wait is attributed. */
  modelName?: string
  /** Two letter monogram for the user's own messages. */
  userInitials?: string
  /**
   * Height reserved under the last message for the composer. Without it
   * a long answer scrolls straight underneath the input.
   */
  spacingOffset?: number
}>()

const emit = defineEmits<{
  edit: [messageId: number, content: string]
}>()

const api = useApi()
const { token } = useToken()
const toast = useToast()

/** The prose of a row, joined across however many text parts it has. */
function textOf(parts?: Array<UiTextPart | UiFilePart>): string {
  return (parts ?? [])
    .filter((part): part is UiTextPart => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

/** "14:03", so a row says when it was said without opening anything. */
function time(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Day separators.
 *
 * Nuxt UI has no notion of when a message was sent, and a chat that
 * crosses midnight is unreadable without a marker, so the first message
 * of each calendar day is tagged here and drawn by the header slot.
 * A map keyed by message id keeps the template a plain lookup.
 */
const dayDividers = computed(() => {
  const dividers = new Map<string, string>()
  let previousDay = ''

  for (const message of props.messages) {
    const created = new Date(message.metadata.createdAt)
    if (Number.isNaN(created.getTime())) continue

    const day = created.toDateString()
    if (day === previousDay) continue
    previousDay = day

    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    dividers.set(
      message.id,
      created.toDateString() === now.toDateString()
        ? 'Today'
        : created.toDateString() === yesterday.toDateString()
          ? 'Yesterday'
          : created.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
    )
  }

  return dividers
})

/** The label for the day a message opens, or nothing when it is mid-day. */
function dividerFor(id: string): string {
  return dayDividers.value.get(id) ?? ''
}

/**
 * Documents live on disk behind the API, which only answers a request
 * carrying the session token. A plain <a download> cannot add an
 * Authorization header, so the bytes are fetched here and handed to the
 * browser as an object URL instead.
 */
const downloading = ref<string | null>(null)

async function download(part: UiFilePart) {
  if (!part.url) return

  downloading.value = part.url
  try {
    const response = await fetch(api.url(part.url), {
      headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
    })
    if (!response.ok) throw new Error(String(response.status))

    const objectUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = part.filename || 'attachment'
    link.click()
    // Revoked on the next tick so the download has taken the reference.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    toast.add({
      title: 'Download failed',
      description: 'The document could not be fetched from the server.',
      icon: 'i-lucide-triangle-alert',
      color: 'error',
    })
  } finally {
    downloading.value = null
  }
}

const copied = ref<string | null>(null)

async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = id
    setTimeout(() => {
      if (copied.value === id) copied.value = null
    }, 1500)
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'The clipboard is not available in this browser.',
      icon: 'i-lucide-triangle-alert',
      color: 'error',
    })
  }
}

/**
 * The question currently open in an editor, as a row id plus its draft.
 *
 * Null means no row is being edited. Only one can be open at a time,
 * because editing a message drops everything after it and two open
 * editors would both be describing a transcript that is about to change.
 */
const editingId = ref<string | null>(null)
const draft = ref('')

function startEdit(id: string, text: string) {
  editingId.value = id
  draft.value = text
}

function cancelEdit() {
  editingId.value = null
  draft.value = ''
}

function commitEdit(id: string) {
  const trimmed = draft.value.trim()

  // Cancelled rather than sent: an empty rewrite is a mistake, and the
  // question as it stands is still a question.
  if (!trimmed) {
    cancelEdit()
    return
  }

  const messageId = Number(id)

  // The row has to be a stored one, or the API has no id to key on.
  if (!Number.isSafeInteger(messageId) || messageId < 1) {
    cancelEdit()
    return
  }

  cancelEdit()
  emit('edit', messageId, trimmed)
}

/**
 * Enter saves, Shift+Enter breaks the line. Composition is respected so
 * an IME can claim Enter for itself, matching the composer's own rule.
 */
function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }

  if (event.key !== 'Enter') return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.isComposing) return

  event.preventDefault()
  if (editingId.value) commitEdit(editingId.value)
}
</script>

<template>
  <!--
    The white goes on the icon slot, not the avatar root. The theme gives
    the icon its own text colour (text-muted from the neutral variant),
    and an element's own colour beats one inherited from its parent, so
    a class on the root never reaches the glyph.
  -->
  <UChatMessages
    :messages="props.messages"
    :status="props.status"
    :should-auto-scroll="true"
    :spacing-offset="props.spacingOffset ?? 0"
    :assistant="{
  avatar: {
    icon: 'i-lucide-bot',
    alt: props.modelName || 'Gemini',
    class: 'bg-primary',
    ui: { icon: 'text-white' },
  },
}"
    class="chat-transcript relative p-4 sm:p-6"
  >
    <template #header="{ id }" >
      <div v-if="dividerFor(id)" class="my-4 flex items-center gap-3 first:mt-0">
        <span class="h-px flex-1 bg-accented" />
        <span class="text-xs font-medium text-dimmed">{{ dividerFor(id) }}</span>
        <span class="h-px flex-1 bg-accented" />
      </div>
    </template>

    <template #files="{ parts }">
      <template v-for="(part, index) in parts" :key="`${part.url}-${index}`">
        <img
          v-if="part.mediaType?.startsWith('image/') && part.url"
          :src="part.url"
          :alt="part.filename || 'Attached image'"
          class="max-h-48 rounded-lg object-cover ring-1 ring-default"
        >
        <UButton
          v-else
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-file-text"
          class="max-w-56"
          :disabled="!part.url"
          :loading="downloading === part.url"
          :label="part.filename || 'Document'"
          @click="download(part)"
        />
      </template>
    </template>

    <template #content="{ id, role, parts, metadata }">
      <!--
        The editor replaces the row in place rather than opening above
        it, so what is being reworded stays where the eye already is.
        It is bound to the draft rather than to the message: typing must
        not mutate the transcript, which is the server's account until
        the edit is accepted.
      -->
      <div v-if="editingId === id" class="w-full space-y-2" @keydown="onEditKeydown">
        <UTextarea
          v-model="draft"
          autoresize
          autofocus
          :maxlength="32_000"
          :ui="{ base: 'w-full' }"
          class="w-full"
        />

        <div class="flex items-center gap-1.5">
          <UButton
            label="Save and resend"
            size="xs"
            class="cursor-pointer"
            :disabled="!draft.trim()"
            @click="commitEdit(id)"
          />
          <UButton
            label="Cancel"
            color="neutral"
            class="cursor-pointer"
            variant="ghost"
            size="xs"
            @click="cancelEdit"
          />
          <span class="text-xs text-dimmed">
            Resending replaces the replies that came after it.
          </span>
        </div>
      </div>

      <template v-else>
        <ChatRichText v-if="role === 'assistant'" :text="textOf(parts)" />
        <p v-else class="whitespace-pre-wrap">{{ textOf(parts) }}</p>

        <!--
          A row that is still arriving gets a caret, so an unfinished
          sentence is not mistaken for a truncated one.
        -->
        <span
          v-if="role === 'assistant' && metadata?.pending"
          class="caret ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-0.5 bg-current align-baseline"
          aria-hidden="true"
        />
      </template>
    </template>

    <template #actions="{ id, role, parts, metadata }">
      <span class="px-1.5 text-xs text-dimmed">{{ time(metadata?.createdAt) }}</span>

      <!--
        Hidden while that row is open in an editor: the Save and Cancel
        below it already say what would happen, and offering both at once
        invites the second one to be pressed by mistake.
      -->
      <UButton
        v-if="metadata?.editable && editingId !== id"
        icon="i-lucide-pencil"
        color="neutral"
        class="cursor-pointer"
        variant="ghost"
        size="xs"
        aria-label="Edit question"
        @click="startEdit(id, textOf(parts))"
      />

      <UButton
        v-if="role === 'assistant'"
        :icon="copied === id ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        class="cursor-pointer"
        variant="ghost"
        size="xs"
        :aria-label="copied === id ? 'Copied' : 'Copy reply'"
        @click="copy(id, textOf(parts))"
      />
    </template>

    <template #indicator>
      <UChatShimmer
        :text="`${props.modelName || 'Gemini'} is thinking`"
        class="py-3 text-sm"
      />
    </template>
  </UChatMessages>
</template>
