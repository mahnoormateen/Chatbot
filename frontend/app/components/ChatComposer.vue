<script setup lang="ts">
import type { ChatStatus } from '~/composables/useChat'
import type { ApiModel, MessageImage, PdfInput } from '~/types/api'
import type { StagedImage, StagedPdf } from '~/types/composer'

/**
 * The input: a text field, a pin for attachments, the model picker and
 * the send button.
 *
 * Everything about the send path is deliberate. UChatPrompt's own
 * submit() refuses empty text, which would make a turn with nothing but
 * a photo impossible to send, so the prompt is rendered as a plain div
 * with "submit on enter" switched off and this component owns both
 * triggers: its own keydown handler and the send button. A reply already
 * in flight turns the button into a stop, which is the component's own
 * behavior and is left alone.
 *
 * Files are read into memory as soon as they are chosen, because that is
 * the only shape the streaming endpoint accepts and because it makes a
 * drop, a paste and a file picker identical from here on.
 */
const props = defineProps<{
  status: ChatStatus
  models: ApiModel[]
  /** Mirrors useChat.selectedModel. */
  modelValue: string
  loadingModels?: boolean
  /** Names the model in use, shown while a reply is being written. */
  model?: string
}>()

const emit = defineEmits<{
  send: [content: string, images: MessageImage[], pdfs: PdfInput[]]
  stop: []
  'update:modelValue': [value: string]
}>()

/** Per turn budgets the backend enforces, mirrored so the user is told. */
const MAX_IMAGES = 3
const MAX_PDFS = 3
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_TURN_BYTES = 12 * 1024 * 1024

const text = ref('')
const images = ref<StagedImage[]>([])
const pdfs = ref<StagedPdf[]>([])
const dragging = ref(false)
let dragDepth = 0
const fileInput = ref<HTMLInputElement | null>(null)
const toast = useToast()

/** Total bytes staged, against the per turn cap. */
const stagedBytes = computed(
  () =>
    images.value.reduce((total, image) => total + image.size, 0) +
    pdfs.value.reduce((total, pdf) => total + pdf.size, 0)
)

const canSend = computed(
  () =>
    props.status === 'ready' &&
    (text.value.trim().length > 0 || images.value.length > 0 || pdfs.value.length > 0) &&
    stagedBytes.value <= MAX_TURN_BYTES
)

/** One word for the state line beside the model picker. */
const hint = computed(() => {
  if (props.status === 'submitted') return `${props.model || 'Gemini'} is thinking...`
  if (props.status === 'streaming') return 'Writing reply...'
  return ''
})

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      // Strip the "data:*;base64," header; the API wants the raw payload.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

let sequence = 0
const nextKey = () => `staged-${++sequence}`

/** One refusal, worded so the next step is obvious. */
function reject(message: string) {
  toast.add({ title: 'Cannot attach that', description: message, icon: 'i-lucide-triangle-alert', color: 'error' })
}

async function addFiles(files: File[]) {
  for (const file of files) {
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'

    if (!isImage && !isPdf) {
      reject(`${file.name} is neither an image nor a PDF.`)
      continue
    }

    const cap = isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES
    if (file.size > cap) {
      reject(
        `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${
          isImage ? 6 : 8
        } MB per ${isImage ? 'image' : 'PDF'}.`
      )
      continue
    }

    if (isImage) {
      if (images.value.length >= MAX_IMAGES) {
        reject(`Three images is the limit. Remove one to add another.`)
        continue
      }
    } else if (pdfs.value.length >= MAX_PDFS) {
      reject(`Three PDFs is the limit. Remove one to add another.`)
      continue
    }

    if (stagedBytes.value + file.size > MAX_TURN_BYTES) {
      reject('These attachments exceed the 12 MB limit for one message.')
      continue
    }

    try {
      const data = await readAsBase64(file)
      if (isImage) {
        images.value.push({
          key: nextKey(),
          name: file.name,
          src: `data:${file.type};base64,${data}`,
          data,
          mimeType: file.type,
          size: file.size,
        })
      } else {
        pdfs.value.push({ key: nextKey(), name: file.name, data, size: file.size })
      }
    } catch {
      reject(`${file.name} could not be read.`)
    }
  }
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

function removePdf(index: number) {
  pdfs.value.splice(index, 1)
}

function submit() {
  if (!canSend.value) return

  const content = text.value.trim()
  const outgoing = {
    content,
    images: images.value.map((image) => ({ mimeType: image.mimeType, data: image.data })),
    pdfs: pdfs.value.map((pdf) => ({ name: pdf.name, data: pdf.data })),
  }

  // Cleared before the emit so a rejected send does not leave the text
  // sitting there with nothing to explain it.
  text.value = ''
  images.value = []
  pdfs.value = []

  emit('send', outgoing.content, outgoing.images, outgoing.pdfs)
}

/**
 * Enter sends, Shift+Enter breaks the line. Composition is respected so
 * a Japanese or Chinese IME can accept Enter for itself.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.isComposing) return

  event.preventDefault()
  submit()
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length) addFiles(files)
}

/**
 * dragleave fires for every child element the pointer crosses, so the
 * overlay is kept up by counting enters and leaves and only cleared when
 * the balance returns to zero.
 */
function onDragEnter() {
  dragDepth += 1
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}
</script>

<template>
  <div
    class="relative"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <!-- Files dropped anywhere over the composer land here. -->
    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-elevated/90 ring-2 ring-primary"
    >
      <p class="text-sm font-medium text-highlighted">Drop images or PDFs to attach</p>
    </div>

    <UChatPrompt
      v-model="text"
      as="div"
      :submit-on-enter="false"
      :autofocus="false"
      placeholder="Ask Gemini anything, or drop a file"
      :ui="{ root: 'rounded-2xl' }"
      @keydown="onKeydown"
    >
      <template #header>
        <ChatStagedFiles
          :images="images"
          :pdfs="pdfs"
          @remove-image="removeImage"
          @remove-pdf="removePdf"
        />
      </template>

      <template #footer>
        <div class="flex min-w-0 items-center gap-1.5">
          <!--
            One control for both kinds of file. A separate image button
            and PDF button would only differ in the accept filter, and
            mis-clicking one is more annoying than reading a wider list.
          -->
          <UButton
            icon="i-lucide-paperclip"
            color="neutral"
            variant="ghost"
            class="cursor-pointer"
            size="xs"
            aria-label="Attach images or PDFs"
            @click="fileInput?.click()"
          />

          <ModelSelect
            :models="props.models"
            :model-value="props.modelValue"
            :loading="props.loadingModels"
            :disabled="props.status !== 'ready'"

            @update:model-value="emit('update:modelValue', $event)"
          />

          <span v-if="hint" class="truncate text-xs text-dimmed">{{ hint }}</span>
        </div>

        <UChatPromptSubmit
          :status="props.status"
          :disabled="!canSend"
          size="xs"
          :on-click="props.status === 'ready' ? submit : undefined"
          class="cursor-pointer text-white"
          @stop="emit('stop')"
        />
      </template>
    </UChatPrompt>

    <!--
      Kept out of the flow: the button above is the affordance, this only
      exists so a click, a drop or a paste can all reach the same reader.
    -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/*,application/pdf"
      class="hidden"
      @change="addFiles(Array.from(($event.target as HTMLInputElement).files ?? []))"
    >
  </div>
</template>
