import { ApiError } from '~/composables/useApi'
import { toFriendlyError } from '~/utils/errors'
import type { FriendlyError } from '~/utils/errors'
import type {
  ApiConversation,
  ApiConversationDetail,
  ApiMessage,
  ApiModel,
  MessageImage,
  PdfInput,
  PendingMessage,
} from '~/types/api'

/**
 * A row in the transcript. Either a persisted message or a placeholder
 * for a reply that is still being streamed in.
 */
export type ChatMessage = ApiMessage | PendingMessage

/**
 * What the composer should say while a turn is in flight. "thinking"
 * covers the wait before the first token, "writing" once text is
 * arriving, and null means nothing is happening.
 */
export type SendPhase = 'thinking' | 'writing' | null

/**
 * What the chat components call the state of a turn. Shared by the
 * transcript, which shows a "submitted" indicator, and the composer,
 * whose submit button turns into a stop button while streaming.
 */
export type ChatStatus = 'submitted' | 'streaming' | 'ready'

type StreamEvent =
  | { type: 'chunk'; chunk: string }
  | { type: 'done'; model: string; message: ApiMessage }
  | { type: 'error'; error: string; status?: number }

/** Temporary id for optimistic rows that have no database id yet. */
let temporaryId = 0
const nextTemporaryId = () => `temp-${++temporaryId}`

/**
 * Decodes a single "data:" payload from the SSE endpoint.
 */
function decodeEvent(raw: string): StreamEvent | null {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof payload.chunk === 'string') return { type: 'chunk', chunk: payload.chunk }
  if (payload.done === true && payload.message) {
    return { type: 'done', model: String(payload.model ?? ''), message: payload.message as ApiMessage }
  }
  if (typeof payload.error === 'string') {
    // The backend forwards the upstream status so a rate limit can be
    // told apart from an unusable model.
    return {
      type: 'error',
      error: payload.error,
      status: typeof payload.status === 'number' ? payload.status : undefined,
    }
  }
  return null
}

/**
 * Reads a text/event-stream response frame by frame. Frames are separated
 * by a blank line and each one is a single "data: {json}" line.
 */
async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  if (!response.body) throw new ApiError('The API returned an empty stream', response.status)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const event = decodeEvent(line.slice(6))
        if (event) onEvent(event)
      }
    }
  }
}

/**
 * Conversations, the active transcript, the model list and the send /
 * stream flow.
 */
export function useChat() {
  const api = useApi()
  const { token } = useToken()

  const conversations = ref<ApiConversation[]>([])
  const activeId = ref<number | null>(null)
  const messages = ref<ChatMessage[]>([])
  const models = ref<ApiModel[]>([])
  const selectedModel = ref<string>('')

  const loadingConversations = ref(false)
  const loadingMessages = ref(false)
  const loadingModels = ref(false)
  const sending = ref(false)
  const error = ref<FriendlyError | null>(null)

  /**
   * The question a failed turn was answering, kept so the banner can
   * offer to send it again without the user retyping it.
   */
  const lastFailedPrompt = ref<string | null>(null)

  /**
   * Pending background refresh of the model list, tracked so it can be
   * cancelled if the page goes away first.
   */
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Aborts the request behind the turn currently in flight, which is how
   * the composer's stop button is wired. Null whenever nothing is being
   * streamed.
   */
  let streamAbort: AbortController | null = null

  const activeConversation = computed(
    () => conversations.value.find((conversation) => conversation.id === activeId.value) ?? null
  )

  /**
   * "thinking" until the first token lands, then "writing" while the
   * answer streams. Drives the status line next to the composer.
   *
   * The check is on the text rather than on the placeholder flag, so
   * the label does not flash back to "thinking" during the final
   * reconcile once the answer has already arrived.
   */
  const sendPhase = computed<SendPhase>(() => {
    if (!sending.value) return null

    const last = messages.value.at(-1)
    if (!last || last.role !== 'assistant') return 'thinking'

    return last.content ? 'writing' : 'thinking'
  })

  /** The model actually in use, for naming it in messages. */
  const activeModelName = computed(
    () => activeConversation.value?.model || selectedModel.value || ''
  )

  /**
   * The turn in flight, in the vocabulary the chat components use: a
   * request that has been sent but has produced nothing yet is
   * "submitted", one that is writing is "streaming", and everything else
   * is "ready". A failure is reported separately by "error", so it never
   * has to be squashed into one value here.
   */
  const status = computed<ChatStatus>(() => {
    if (!sending.value) return 'ready'
    return sendPhase.value === 'writing' ? 'streaming' : 'submitted'
  })

  function clearError(): void {
    error.value = null
  }

  async function loadModels(): Promise<void> {
    loadingModels.value = true
    try {
      models.value = await api.get<ApiModel[]>('/api/models')

      /**
       * The backend only returns models it has confirmed this key can
       * call, already ordered with the best default first. Naming a
       * model here would bring back the two hardcoded assumptions this
       * list exists to remove, so the first entry is used as it comes.
       */
      const first = models.value[0]?.id ?? ''
      if (first && (!selectedModel.value || !models.value.some((m) => m.id === selectedModel.value))) {
        selectedModel.value = first
      }

      scheduleModelRefresh()
    } catch (caught) {
      error.value = toFriendlyError(caught, { action: 'loading the model list' })
    } finally {
      loadingModels.value = false
    }
  }

  /**
   * Picks up the rest of the list shortly after it was first requested.
   *
   * The backend confirms each model in the background, so the first
   * response can arrive while that work is still running and hold fewer
   * entries than the finished list. This only ever widens the list to
   * models the backend confirmed, and it deliberately leaves the loading
   * flag alone so the picker does not flicker while it happens.
   */
  function scheduleModelRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer)

    refreshTimer = setTimeout(async () => {
      refreshTimer = null
      try {
        const latest = await api.get<ApiModel[]>('/api/models')
        if (latest.length > models.value.length) models.value = latest
      } catch {
        // A background refresh is not worth interrupting anyone over.
      }
    }, 2000)
  }

  /**
   * Registered here rather than next to the timer: loadModels is called
   * from a watcher, and a watcher callback runs outside the effect scope
   * that owns it, so onScopeDispose would have nothing to attach to.
   */
  onScopeDispose(() => {
    if (refreshTimer) clearTimeout(refreshTimer)
    streamAbort?.abort()
  })

  async function loadConversations(): Promise<void> {
    loadingConversations.value = true
    try {
      conversations.value = await api.get<ApiConversation[]>('/api/conversations')
    } catch (caught) {
      error.value = toFriendlyError(caught, { action: 'loading your conversations' })
    } finally {
      loadingConversations.value = false
    }
  }

  async function openConversation(id: number): Promise<void> {
    activeId.value = id
    loadingMessages.value = true
    error.value = null

    try {
      const detail = await api.get<ApiConversationDetail>(`/api/conversations/${id}`)
      messages.value = detail.messages
      if (detail.model) selectedModel.value = detail.model
    } catch (caught) {
      messages.value = []
      error.value = toFriendlyError(caught, { action: 'opening that conversation' })
    } finally {
      loadingMessages.value = false
    }
  }

  async function createConversation(): Promise<number | null> {
    error.value = null
    try {
      const conversation = await api.post<ApiConversationDetail>('/api/conversations', {})
      conversations.value = [conversation, ...conversations.value]
      activeId.value = conversation.id
      messages.value = []
      if (conversation.model) selectedModel.value = conversation.model
      return conversation.id
    } catch (caught) {
      error.value = toFriendlyError(caught, { action: 'starting a new conversation' })
      return null
    }
  }

  async function deleteConversation(id: number): Promise<void> {
    const previous = conversations.value
    conversations.value = conversations.value.filter((conversation) => conversation.id !== id)

    try {
      await api.delete(`/api/conversations/${id}`)
      if (activeId.value === id) {
        activeId.value = null
        messages.value = []
      }
    } catch (caught) {
      conversations.value = previous
      error.value = toFriendlyError(caught, { action: 'deleting that conversation' })
    }
  }

  async function renameConversation(id: number, title: string): Promise<void> {
    const trimmed = title.trim()
    if (!trimmed) return

    const target = conversations.value.find((conversation) => conversation.id === id)
    if (!target) return

    const previousTitle = target.title
    target.title = trimmed
    try {
      await api.patch(`/api/conversations/${id}`, { title: trimmed })
    } catch (caught) {
      target.title = previousTitle
      error.value = toFriendlyError(caught, { action: 'renaming that conversation' })
    }
  }

  /**
   * Posts a turn to a streaming endpoint and reports what comes back.
   *
   * Shared by sending and by editing: both open the same kind of stream,
   * fill the same placeholder bubble and finish on the same "done"
   * event. The only thing that differs is the URL, so it is passed in.
   */
  async function streamTurn(
    path: string,
    body: Record<string, unknown>,
    replyId: string,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(api.url(path), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      },
      signal,
      body: JSON.stringify(body),
    })

    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new ApiError(`The API answered with status ${response.status}`, response.status)
    }

    let failure: StreamEvent | null = null

    await readEventStream(response, (event) => {
      const reply = messages.value.find((message) => message.id === replyId)

      if (event.type === 'chunk') {
        if (reply) reply.content += event.chunk
      } else if (event.type === 'error') {
        failure = event
      } else if (event.type === 'done') {
        const index = messages.value.findIndex((message) => message.id === replyId)
        if (index !== -1) messages.value.splice(index, 1, event.message)
      }
    })

    if (failure) {
      // The stream already answered 200, so the upstream status has to
      // be carried inside the event for the mapping to work.
      const event = failure as Extract<StreamEvent, { type: 'error' }>
      throw new ApiError(event.error, event.status ?? 502, { message: event.error })
    }
  }

  /**
   * Sends a message and streams the reply back.
   *
   * The transcript is updated optimistically: the user message appears
   * immediately and the assistant row is filled chunk by chunk. The
   * optimistic rows are replaced by the persisted messages once the
   * backend reports them in the "done" event.
   */
  async function sendMessage(
    content: string,
    images: MessageImage[] = [],
    pdfs: PdfInput[] = []
  ): Promise<void> {
    const trimmed = content.trim()
    if ((!trimmed && images.length === 0 && pdfs.length === 0) || sending.value) return

    let conversationId = activeId.value
    if (conversationId === null) {
      conversationId = await createConversation()
      if (conversationId === null) return
    }

    sending.value = true
    error.value = null
    lastFailedPrompt.value = null

    const now = new Date().toISOString()
    messages.value.push({
      id: nextTemporaryId(),
      conversationId,
      role: 'user',
      content: trimmed,
      images,
      attachments: pdfs.map((pdf) => ({
        // Placeholder: the real id is assigned when the turn is stored.
        id: 0,
        name: pdf.name,
        mimeType: 'application/pdf',
        size: Math.round((pdf.data.length * 3) / 4),
      })),
      createdAt: now,
      pending: true,
    })

    const replyId = nextTemporaryId()
    messages.value.push({
      id: replyId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: now,
      pending: true,
    })

    streamAbort = new AbortController()

    try {
      await streamTurn(
        `/api/conversations/${conversationId}/messages/stream`,
        selectedModel.value
          ? { content: trimmed, model: selectedModel.value, images, pdfs }
          : { content: trimmed, images, pdfs },
        replyId,
        streamAbort.signal
      )

      /**
       * The turn is stored server side, so the optimistic rows are
       * replaced by what the backend actually persisted. This is also
       * what picks up the title the backend derived from the first
       * message.
       */
      const detail = await api.get<ApiConversationDetail>(`/api/conversations/${conversationId}`)
      messages.value = detail.messages
      if (detail.model) selectedModel.value = detail.model

      await loadConversations()
    } catch (caught) {
      /**
       * A stop is a deliberate act, not a failure, so nothing is offered
       * for retry and no banner is raised. The transcript is reloaded
       * instead of being left holding the optimistic rows: the backend
       * writes a turn atomically and keeps nothing for a cancelled one,
       * so the server is the only account of what actually happened. The
       * half written reply goes with it, which is why the question is
       * still sitting in the transcript for the user to send again.
       */
      if (streamAbort?.signal.aborted) {
        await openConversation(conversationId).catch(() => {})
        return
      }

      // Drop the empty placeholder bubble so the transcript is not left hanging.
      const index = messages.value.findIndex((message) => message.id === replyId)
      const reply = index === -1 ? undefined : messages.value[index]

      if (reply) {
        if (!reply.content) messages.value.splice(index, 1)
        else (reply as PendingMessage).pending = false
      }

      /**
       * The question is kept so the banner can offer to resend it, and
       * the model is named so a quota or availability problem points at
       * the picker instead of reading as a generic failure.
       */
      lastFailedPrompt.value = trimmed
      const failure = toFriendlyError(caught, {
        model: selectedModel.value || undefined,
        action: 'getting a reply',
        scope: 'send',
      })
      error.value = failure

      // The backend stores a turn atomically, so a failure leaves nothing
      // behind. Reloading anyway reconciles with whatever the server
      // actually holds instead of trusting the optimistic rows.
      await openConversation(conversationId).catch(() => {})

      // "openConversation" clears the error on its way in, so the send
      // failure is restored: that is what the user needs to act on.
      error.value = failure
    } finally {
      streamAbort = null
      sending.value = false
    }
  }

  /**
   * Rewords a question that was already sent and streams a fresh answer.
   *
   * This is a fork, not a patch, so the transcript is rebuilt the same
   * way: the old wording is replaced in place, the rows after it are
   * dropped and a new placeholder answer is appended. The backend does
   * the same thing to the conversation, so the two agree once "done"
   * arrives.
   */
  async function editMessage(messageId: number, content: string): Promise<void> {
    const trimmed = content.trim()
    const conversationId = activeId.value

    if (!trimmed || conversationId === null || sending.value) return

    const index = messages.value.findIndex((message) => message.id === messageId)
    const target = index === -1 ? undefined : messages.value[index]

    /**
     * Guarded here as well as in the adapter because the id arrives from
     * a component: only a stored user turn carries one the backend can
     * act on.
     */
    if (!target || 'pending' in target || target.role !== 'user') return

    sending.value = true
    error.value = null
    lastFailedPrompt.value = null

    /**
     * Everything after the edited row is removed here rather than after
     * the round trip, so the transcript stops contradicting itself
     * immediately instead of waiting for the server to agree.
     */
    messages.value.splice(index + 1)
    target.content = trimmed

    const now = new Date().toISOString()
    const replyId = nextTemporaryId()
    messages.value.push({
      id: replyId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: now,
      pending: true,
    })

    streamAbort = new AbortController()

    try {
      await streamTurn(
        `/api/conversations/${conversationId}/messages/${messageId}/edit`,
        selectedModel.value
          ? { content: trimmed, model: selectedModel.value }
          : { content: trimmed },
        replyId,
        streamAbort.signal
      )

      const detail = await api.get<ApiConversationDetail>(`/api/conversations/${conversationId}`)
      messages.value = detail.messages
      if (detail.model) selectedModel.value = detail.model

      await loadConversations()
    } catch (caught) {
      /**
       * A stop part way through leaves the reworded question on the
       * server with no answer, which is a state worth showing rather
       * than hiding, so it is reconciled and no banner is raised.
       */
      if (streamAbort?.signal.aborted) {
        await openConversation(conversationId).catch(() => {})
        return
      }

      const reply = messages.value.find((message) => message.id === replyId)
      if (reply && !reply.content) {
        messages.value.splice(messages.value.findIndex((message) => message.id === replyId), 1)
      }

      lastFailedPrompt.value = trimmed
      const failure = toFriendlyError(caught, {
        model: selectedModel.value || undefined,
        action: 'getting a reply to the edited question',
        scope: 'send',
      })
      error.value = failure

      /**
       * The backend rewrites the question before it asks, so a failure
       * here still leaves the new wording stored. Reloading picks up
       * whichever half of that the server actually holds.
       */
      await openConversation(conversationId).catch(() => {})

      error.value = failure
    } finally {
      streamAbort = null
      sending.value = false
    }
  }

  /**
   * Cancels the turn in flight. The partial answer stays on screen, the
   * transcript is reloaded from the server, and no error is raised.
   */
  function stop(): void {
    streamAbort?.abort()
  }

  /** Sends the question again after a failed turn. */
  async function retryLastMessage(): Promise<void> {
    const prompt = lastFailedPrompt.value
    if (!prompt) return

    lastFailedPrompt.value = null
    await sendMessage(prompt)
  }

  /**
   * Drops every trace of the previous session. Called on sign out so the
   * next user never sees the previous transcript.
   */
  function reset(): void {
    streamAbort?.abort()
    streamAbort = null
    conversations.value = []
    activeId.value = null
    messages.value = []
    models.value = []
    selectedModel.value = ''
    loadingConversations.value = false
    loadingMessages.value = false
    loadingModels.value = false
    sending.value = false
    error.value = null
    lastFailedPrompt.value = null
  }

  return {
    conversations,
    activeId,
    activeConversation,
    messages,
    models,
    selectedModel,
    loadingConversations,
    loadingMessages,
    loadingModels,
    sending,
    sendPhase,
    status,
    activeModelName,
    error,
    canRetry: computed(() => Boolean(lastFailedPrompt.value)),
    loadModels,
    loadConversations,
    openConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    sendMessage,
    editMessage,
    retryLastMessage,
    stop,
    clearError,
    reset,
  }
}
