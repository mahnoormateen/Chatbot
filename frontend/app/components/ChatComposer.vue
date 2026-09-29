<script setup lang="ts">
import type { ApiModel, MessageImage, PdfInput } from '~/types/api'
import type { ChatStatus, SendPhase } from '~/composables/useChat'

/**
 * The composer: a chat prompt, the files pinned to the turn that is
 * about to be sent, the model picker and the send or stop control.
 *
 * The turn itself is assembled here but sent by the page, which owns the
 * chat store. Nothing in this component talks to the API.
 */
const props = defineProps<{
  sending: boolean
  /** Drives the send button turning into a stop button. */
  status: ChatStatus
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
  stop: []
  'update:modelValue': [value: string]
}>()

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
const prompt = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)
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
  const subject = props.model?.trim() || 'Gemini'
  return props.phase === 'writing' ? `${subject} is writing` : `${subject} is thinking`
})

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

  // Put the caret back for the next message as soon as the box is empty.
  nextTick(() => prompt.value?.textareaRef?.focus())
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

function removeImage(index: number) {
  attachments.value.splice(index, 1)
}

function removePdf(index: number) {
  pdfs.value.splice(index, 1)
}

/**
 * Enter sends, Shift+Enter inserts a newline.
 *
 * This runs alongside the prompt's own handler, which is why
 * "submit-on-enter" is turned off on the prompt: otherwise a message with
 * text would be sent twice. A composition in progress is left alone so
 * an IME candidate is not committed by Enter.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (event.shiftKey || event.isComposing || event.keyCode === 229) return
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
</script>

<template>
  <div
    class="relative"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!--
      One input behind the pin button, covering both supported kinds of
      file. "accept" is a filter hint the browser shows in the file
      dialog; it is not a security boundary, which is why every file is
      still type checked in stageFiles.
    -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,application/pdf"
      multiple
      class="sr-only"
      @change="onFilesPicked"
    >

    <!--
      "as: div" turns the prompt into a plain container. Its own submit
      handler refuses to fire when the box is empty, which would make an
      attachment only turn impossible to send, and the send button below
      is wired to "submit" here instead.
    -->
    <UChatPrompt
      ref="prompt"
      v-model="draft"
      as="div"
      :submit-on-enter="false"
      :disabled="sending"
      placeholder="Ask Gemini anything, or drop in a file"
      variant="outline"
      class="w-full"
      :ui="{ footer: 'flex-col items-stretch gap-2 sm:flex-row sm:items-center' }"
      @keydown="onKeydown"
      @paste="onPaste"
    >
      <template #header>
        <ChatStagedFiles
          v-if="attachments.length || pdfs.length"
          :images="attachments"
          :pdfs="pdfs"
          @remove-image="removeImage"
          @remove-pdf="removePdf"
        />
      </template>

      <template #footer>
        <div class="flex items-center gap-1.5">
          <UButton
            icon="i-lucide-paperclip"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            aria-label="Pin images or PDFs"
            :disabled="sending"
            @click="openFilePicker"
          />

          <ModelPicker
            :models="models"
            :model-value="modelValue"
            :loading="loadingModels"
            :disabled="sending"
            @update:model-value="emit('update:modelValue', $event)"
          />

          <span v-if="statusLabel" class="hidden truncate text-xs text-muted sm:inline">
            {{ statusLabel }}
          </span>
        </div>

        <div class="flex items-center justify-end">
          <UChatPromptSubmit
            :status="status"
            :disabled="!canSend"
            :on-click="status === 'ready' ? submit : undefined"
            color="primary"
            size="sm"
            square
            @stop="emit('stop')"
          />
        </div>
      </template>
    </UChatPrompt>

    <UAlert
      v-if="attachError"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      class="mt-2"
      :title="attachError"
      :close="true"
      @close="attachError = ''"
    />

    <div
      v-if="dragActive"
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-default/85 ring-2 ring-primary backdrop-blur-sm"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-upload" class="size-6 text-primary" />
      <span class="text-sm font-medium">Drop images or PDFs to pin them</span>
    </div>
  </div>
</template>
