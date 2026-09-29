<script setup lang="ts">
import type { MessageImage } from '~/types/api'
import type { SendPhase } from '~/composables/useChat'

const props = defineProps<{
  sending: boolean
  /** "thinking" before the first token, "writing" while it streams. */
  phase?: SendPhase
  /** Named in the status line so it is clear what is being waited on. */
  model?: string
}>()

const emit = defineEmits<{ send: [content: string, images?: MessageImage[]] }>()

/**
 * A file staged in the composer, not sent yet. "data" is the base64
 * payload already stripped of its "data:*;base64," header, ready to post.
 */
interface StagedImage {
  name: string
  mimeType: string
  data: string
}

/** Mirrors the mime types the backend validator accepts. */
const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

/** Base64 characters for a roughly 6 MB image: the per-file ceiling. */
const MAX_DATA_LENGTH = 8_000_000

/** The backend accepts at most this many images per message. */
const MAX_IMAGES = 3

const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const attachments = ref<StagedImage[]>([])
const attachError = ref('')

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

const canSend = computed(
  () => (draft.value.trim().length > 0 || attachments.value.length > 0) && !props.sending
)

function submit() {
  if (!canSend.value) return

  emit(
    'send',
    draft.value.trim(),
    attachments.value.map(({ mimeType, data }) => ({ mimeType, data }))
  )
  draft.value = ''
  attachments.value = []
  attachError.value = ''

  // Clear the box and shrink it back before the next message streams in.
  nextTick(() => {
    autoGrow()
    textarea.value?.focus()
  })
}

function pickImages() {
  if (props.sending) return
  fileInput.value?.click()
}

/**
 * Queues the picked files, enforcing the same limits the backend applies.
 * Reading is async, so each file resolves on its own and errors are
 * surfaced in the attachError notice.
 */
function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  attachError.value = ''

  if (files.length === 0) return

  const room = MAX_IMAGES - attachments.value.length
  if (room <= 0) {
    attachError.value = `At most ${MAX_IMAGES} images per message`
    return
  }

  let staged = 0
  for (const file of files) {
    if (staged >= room) {
      attachError.value = `At most ${MAX_IMAGES} images per message`
      break
    }
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      attachError.value = `${file.name} is not a supported image (JPEG, PNG, WebP, HEIC/HEIF)`
      continue
    }
    staged++
    readFileAsImage(file).then((image) => {
      if (image) attachments.value.push(image)
    })
  }
}

function readFileAsImage(file: File): Promise<StagedImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/s.exec(url)
      if (!match) {
        resolve(null)
        return
      }

      const mimeType = match[1]
      const data = match[2]
      if (!mimeType || !data) {
        resolve(null)
        return
      }

      if (data.length > MAX_DATA_LENGTH) {
        attachError.value = `${file.name} is larger than the 6 MB limit`
        resolve(null)
        return
      }

      resolve({ name: file.name, mimeType, data })
    }
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  attachments.value.splice(index, 1)
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
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept="image/*"
      multiple
      @change="onFilesSelected"
    />

    <div v-if="attachments.length" class="previews" role="list" aria-label="Images to send">
      <figure v-for="(attachment, index) in attachments" :key="index" class="preview" role="listitem">
        <img :src="`data:${attachment.mimeType};base64,${attachment.data}`" :alt="attachment.name" />
        <button
          class="remove"
          type="button"
          :aria-label="`Remove ${attachment.name}`"
          @click="removeImage(index)"
        >
          ×
        </button>
        <figcaption class="name">{{ attachment.name }}</figcaption>
      </figure>
    </div>

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
      <div class="bar-actions">
        <button
          class="btn attach"
          type="button"
          :disabled="props.sending"
          aria-label="Attach an image"
          title="Attach an image"
          @click="pickImages"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Image</span>
        </button>

        <span v-if="attachError" class="error" role="status" aria-live="polite">
          {{ attachError }}
        </span>
        <span v-else-if="statusLabel" class="status" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          {{ statusLabel }}
        </span>
        <span v-else class="hint">Enter to send | Shift+Enter for a new line</span>
      </div>

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
  box-shadow: 0 8px 30px var(--shadow-color);
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

.bar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.file-input {
  display: none;
}

.attach {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.attach:hover:not(:disabled) {
  color: var(--accent-strong);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.hint {
  font-size: 11.5px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error {
  font-size: 11.5px;
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-muted);
}

/* Staged image previews shown above the textarea. */
.previews {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preview {
  position: relative;
  margin: 0;
  max-width: 140px;
}

.preview img {
  display: block;
  max-width: 140px;
  max-height: 110px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--bg-elevated);
}

.preview .remove {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.preview .remove:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.preview .name {
  max-width: 140px;
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
