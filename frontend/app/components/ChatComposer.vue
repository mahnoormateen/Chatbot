<script setup lang="ts">
import type { ApiModel, MessageImage, PdfInput } from '~/types/api'
import type { SendPhase } from '~/composables/useChat'

const props = defineProps<{
  sending: boolean
  /** "thinking" before the first token, "writing" while it streams. */
  phase?: SendPhase
  /** Named in the status line so it is clear what is being waited on. */
  model?: string
  /** The model list lives here so the dropdown sits next to Send. */
  models: ApiModel[]
  /** The model currently selected, mirroring useChat.selectedModel. */
  modelValue: string
  /** Shown in the dropdown while the model list is still loading. */
  loadingModels?: boolean
}>()

const emit = defineEmits<{
  send: [content: string, images?: MessageImage[], pdfs?: PdfInput[]]
  'update:modelValue': [value: string]
}>()

const selectedModel = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

/**
 * A file staged in the composer, not sent yet. "data" is the base64
 * payload already stripped of its "data:*;base64," header, ready to post.
 */
interface StagedImage {
  name: string
  mimeType: string
  data: string
}

/** A PDF staged for the turn, with its raw byte count for the size caps. */
interface StagedPdf {
  name: string
  data: string
  size: number
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

/**
 * PDF ceilings aligned with config/gemini.ts on the backend: per file and
 * per turn, measured in raw bytes before base64 inflation.
 */
const MAX_PDFS = 3
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_PDF_TOTAL_BYTES = 12 * 1024 * 1024

const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const attachments = ref<StagedImage[]>([])
const pdfs = ref<StagedPdf[]>([])
const attachError = ref('')

/** True while a dragged file hovers the composer, drives the drop hint. */
const dragActive = ref(false)
/** Drag enter/leave fire per child element; counting keeps the state sane. */
let dragDepth = 0

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
  () =>
    (draft.value.trim().length > 0 ||
      attachments.value.length > 0 ||
      pdfs.value.length > 0) &&
    !props.sending
)

function submit() {
  if (!canSend.value) return

  emit(
    'send',
    draft.value.trim(),
    attachments.value.map(({ mimeType, data }) => ({ mimeType, data })),
    pdfs.value.map(({ name, data }) => ({ name, data }))
  )
  draft.value = ''
  attachments.value = []
  pdfs.value = []
  attachError.value = ''

  // Clear the box and shrink it back before the next message streams in.
  nextTick(() => {
    autoGrow()
    textarea.value?.focus()
  })
}

/**
 * The pin button opens one hidden input that serves both kinds of file,
 * so attaching is a single control. "accept" is only a filter hint for
 * the browser's file dialog - it is not a security boundary, which is why
 * every file is still type checked in stageFiles.
 */
function openFilePicker() {
  if (props.sending) return
  fileInput.value?.click()
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  stageFiles(files)
}

/**
 * Queues picked, pasted or dropped files, enforcing the same limits the
 * backend applies. Reading is async, so each file resolves on its own and
 * errors are surfaced in the attachError notice.
 */
function stageFiles(files: File[]) {
  attachError.value = ''
  if (!files.length) return

  const images: File[] = []
  const documents: File[] = []
  /**
   * Every rejection is collected rather than overwritten, so a drop of
   * five mixed files reports all five problems instead of only the last.
   */
  const rejected: string[] = []

  for (const file of files) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      documents.push(file)
    } else if (ACCEPTED_MIME_TYPES.has(file.type)) {
      images.push(file)
    } else if (file.type.startsWith('image/')) {
      rejected.push(`${file.name} is not a supported image (JPEG, PNG, WebP, HEIC or HEIF)`)
    } else {
      /**
       * The name is quoted so the message stays readable for a file
       * called "invoice.docx", which is the common case here.
       */
      rejected.push(`"${file.name}" is not an image or a PDF`)
    }
  }

  // Images have their own count and per-file size caps.
  let imageRoom = MAX_IMAGES - attachments.value.length
  for (const file of images) {
    if (imageRoom <= 0) {
      rejected.push(`Only ${MAX_IMAGES} images can be pinned to one message`)
      break
    }
    imageRoom--
    readFileAsImage(file).then((staged) => {
      /**
       * Reading is asynchronous, so a size failure arrives after the
       * notice above has already been shown. It is reported through the
       * same line rather than dropped.
       */
      if (staged.image) attachments.value.push(staged.image)
      else if (staged.error) attachError.value = attachError.value
        ? `${attachError.value}. ${staged.error}`
        : staged.error
    })
  }

  // PDFs cap per file and per turn in raw bytes.
  let pdfRoom = MAX_PDFS - pdfs.value.length
  let totalSoFar = pdfs.value.reduce((sum, pdf) => sum + pdf.size, 0)

  for (const file of documents) {
    if (pdfRoom <= 0) {
      rejected.push(`Only ${MAX_PDFS} PDFs can be pinned to one message`)
      break
    }
    if (file.size > MAX_PDF_BYTES) {
      rejected.push(`"${file.name}" is larger than the 8 MB limit`)
      continue
    }
    if (totalSoFar + file.size > MAX_PDF_TOTAL_BYTES) {
      rejected.push(`"${file.name}" would push the PDFs past the 12 MB limit`)
      continue
    }

    pdfRoom--
    totalSoFar += file.size
    readFileAsPdf(file).then((staged) => {
      if (staged.pdf) pdfs.value.push({ ...staged.pdf, size: file.size })
      else if (staged.error) attachError.value = attachError.value
        ? `${attachError.value}. ${staged.error}`
        : staged.error
    })
  }

  attachError.value = rejected.join('. ')
}

/** Either the staged image or the reason it could not be staged. */
function readFileAsImage(file: File): Promise<{ image?: StagedImage; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ error: `"${file.name}" could not be read` })
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/s.exec(url)
      const mimeType = match?.[1]
      const data = match?.[2]

      if (!mimeType || !data) {
        resolve({ error: `"${file.name}" could not be read` })
        return
      }

      /**
       * The cap is on the encoded length, since that is what the request
       * and the database column actually carry.
       */
      if (data.length > MAX_DATA_LENGTH) {
        resolve({ error: `"${file.name}" is larger than the 6 MB image limit` })
        return
      }

      resolve({ image: { name: file.name, mimeType, data } })
    }
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  attachments.value.splice(index, 1)
}

/** Either the staged document or the reason it could not be staged. */
function readFileAsPdf(file: File): Promise<{ pdf?: Omit<StagedPdf, 'size'>; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ error: `"${file.name}" could not be read` })
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const match = /^data:[^;,]+;base64,(.+)$/s.exec(url)
      if (!match?.[1]) {
        resolve({ error: `"${file.name}" could not be read` })
        return
      }
      resolve({ pdf: { name: file.name, data: match[1] } })
    }
    reader.readAsDataURL(file)
  })
}

function removePdf(index: number) {
  pdfs.value.splice(index, 1)
}

/** Compact human readable size for a chip: 512 KB, 1.2 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Enter sends, Shift+Enter inserts a newline. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}

/**
 * Images copied to the clipboard (a screenshot, a copied photo) can be
 * attached directly instead of going through the file dialog.
 */
function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  const files: File[] = []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }

  if (!files.length) return

  // We handle the files ourselves, so the paste must not also drop text
  // (often a rich-text dump of the same image) into the textarea.
  event.preventDefault()
  stageFiles(files)
}

function onDragEnter(event: DragEvent) {
  event.preventDefault()
  dragDepth++
  dragActive.value = true
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent) {
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragActive.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragDepth = 0
  dragActive.value = false

  const files = Array.from(event.dataTransfer?.files ?? [])
  stageFiles(files)
}

onMounted(autoGrow)
</script>

<template>
  <form
    class="composer"
    :class="{ dragging: dragActive }"
    @submit.prevent="submit"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dragActive" class="drop-overlay" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span>Drop images or PDFs to pin them</span>
    </div>

    <!--
      One input behind the pin button, covering both supported kinds of
      file. "accept" is a filter hint the browser shows in the file
      dialog; it is not a security boundary, which is why every file is
      still type checked in stageFiles.
    -->
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,application/pdf"
      multiple
      @change="onFilesPicked"
    />

    <div
      v-if="attachments.length || pdfs.length"
      class="previews"
      role="list"
      aria-label="Files to send"
    >
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

      <div v-for="(pdf, index) in pdfs" :key="`pdf-${index}`" class="pdf-preview" role="listitem">
        <span class="pdf-badge" aria-hidden="true">PDF</span>
        <span class="pdf-name">{{ pdf.name }}</span>
        <span class="pdf-size">{{ formatBytes(pdf.size) }}</span>
        <button
          class="pdf-remove"
          type="button"
          :aria-label="`Remove ${pdf.name}`"
          @click="removePdf(index)"
        >
          ×
        </button>
      </div>
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
      @paste="onPaste"
    />

    <div class="bar">
      <div class="bar-actions">
        <button
          class="btn attach"
          type="button"
          :disabled="props.sending"
          aria-label="Pin an image or PDF to this message"
          title="Pin an image or PDF to this message"
          @click="openFilePicker"
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
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
            />
          </svg>
          <span>Pin</span>
        </button>

        <span v-if="attachError" class="error" role="status" aria-live="polite">
          {{ attachError }}
        </span>
        <span v-else-if="statusLabel" class="status" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          {{ statusLabel }}
        </span>
        <span v-else class="hint">Enter to send | Shift+Enter for a new line | paste or drop files</span>
      </div>

      <div class="bar-end">
        <ModelPicker
          v-model="selectedModel"
          :models="props.models"
          :disabled="props.sending"
          :loading="props.loadingModels"
        />

        <button class="btn btn-primary send" type="submit" :disabled="!canSend">
          <span v-if="props.sending" class="spinner" aria-hidden="true" />
          <span v-else>Send</span>
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg);
  box-shadow: 0 8px 30px var(--shadow-color);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), 0 8px 30px var(--shadow-color);
}

.composer.dragging {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

/* Full-composer hint shown while a file hovers over it. */
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-lg);
  border: 2px dashed var(--accent);
  background: color-mix(in srgb, var(--bg) 88%, var(--accent) 12%);
  color: var(--accent-strong);
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
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

/* Model dropdown + Send, grouped at the right end of the composer bar. */
.bar-end {
  display: flex;
  align-items: center;
  gap: 10px;
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

/*
 * The rejection notice can name several files, so it wraps instead of
 * being truncated on one line. Capped at two lines so a large drop of
 * bad files cannot push the send button out of the composer.
 */
.error {
  max-width: 100%;
  max-height: 2.6em;
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--danger);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

/* Staged PDF chips, shown beside the image previews. */
.pdf-preview {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  font-size: 12px;
}

.pdf-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.pdf-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.pdf-size {
  flex: none;
  color: var(--text-faint);
  font-size: 11px;
}

.pdf-remove {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.pdf-remove:hover {
  color: var(--danger);
}

.send {
  min-width: 84px;
}

@media (max-width: 640px) {
  .hint {
    display: none;
  }

  /* Keep the dropdown and Send side by side on phones. */
  .bar-end :deep(select) {
    max-width: 130px;
  }
}
</style>