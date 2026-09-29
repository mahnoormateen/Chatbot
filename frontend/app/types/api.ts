/**
 * Shapes returned by the AdonisJS API.
 *
 * Every endpoint wraps its payload in a "data" key, so these describe the
 * object that sits inside it. See backend/providers/api_provider.ts.
 */

export interface ApiUser {
  id: number
  fullName: string | null
  email: string
  initials: string
  createdAt: string
}

export interface AuthPayload {
  user: ApiUser
  token: string
}

export type MessageRole = 'user' | 'assistant'

/**
 * An image attached to a user message. "data" carries the raw base64
 * payload (no "data:*;base64," header) and "mimeType" lets the client
 * rebuild the data URI it needs to render the thumbnail.
 */
export interface MessageImage {
  mimeType: string
  data: string
}

export interface ApiMessage {
  id: number
  conversationId: number
  role: MessageRole
  content: string
  images?: MessageImage[]
  createdAt: string
}

export interface ApiConversation {
  id: number
  title: string
  model: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ApiConversationDetail extends ApiConversation {
  messages: ApiMessage[]
}

/**
 * Availability of a model for the configured key.
 *
 * "rateLimited" means the model answered a 429 during discovery, which is
 * a quota state that lifts on its own. The model is still offered, marked
 * so the user knows to expect a slow turn rather than an error.
 */
export type ApiModelStatus = 'ready' | 'rateLimited'

export interface ApiModel {
  id: string
  displayName: string
  /** Null for the static fallback list served when the Gemini API is unreachable. */
  description: string | null
  inputTokenLimit: number | null
  outputTokenLimit: number | null
  /** Absent from an older backend, which only served confirmed models. */
  status?: ApiModelStatus
}

/**
 * A message that is still being streamed and therefore has no id yet.
 * Kept separate from ApiMessage so the UI can render it optimistically.
 */
export interface PendingMessage {
  id: string
  conversationId: number
  role: MessageRole
  content: string
  images?: MessageImage[]
  createdAt: string
  pending?: boolean
}
