import type { ChatMessage } from '~/composables/useChat'
import type { ApiAttachment, MessageImage, MessageRole } from '~/types/api'

/**
 * A transcript row in the shape the chat components expect.
 *
 * Nuxt UI renders each message from an ordered list of "parts" rather
 * than a single text field, which is what lets a single message carry
 * prose, images and documents side by side. Adapting here rather than
 * changing the API response keeps the streaming code talking about one
 * message with one string of text.
 */
export interface UiTextPart {
  type: 'text'
  text: string
}

export interface UiFilePart {
  type: 'file'
  mediaType: string
  /**
   * Where the bytes are.
   *
   * An image is inlined as a data URI because it travelled as base64 to
   * begin with, so there is nothing to fetch. A document lives on the
   * server and this is the API path that returns it, which needs the
   * session token and therefore cannot be handed to a plain link.
   */
  url?: string
  filename?: string
  /** Byte count, shown next to the document name. */
  size?: number
}

export type UiMessagePart = UiTextPart | UiFilePart

export interface UiMessageMetadata {
  createdAt: string
  /** Owning conversation, needed to address an attachment on the API. */
  conversationId: number
  images: MessageImage[]
  attachments: ApiAttachment[]
  /** True while the row is optimistic and the backend has not stored it. */
  pending: boolean
}

export interface UiMessage {
  /**
   * The row id as a string. The components key on this and the API uses
   * numbers while a streaming row uses "temp-n", so it is normalised
   * here once instead of at every lookup.
   */
  id: string
  role: MessageRole
  parts: UiMessagePart[]
  metadata: UiMessageMetadata
}

/**
 * Rebuilds the data URI the backend strips down to bare base64 for
 * transport. A large image therefore becomes a long string in the part,
 * which is the same cost it already had on the message.
 */
function imageSrc(image: MessageImage): string {
  return `data:${image.mimeType};base64,${image.data}`
}

function toParts(message: ChatMessage): UiMessagePart[] {
  const parts: UiMessagePart[] = []

  // Text first, so the prose leads and the files read as attachments.
  if (message.content) parts.push({ type: 'text', text: message.content })

  for (const image of message.images ?? []) {
    parts.push({
      type: 'file',
      mediaType: image.mimeType,
      url: imageSrc(image),
    })
  }

  // An optimistic row carries a placeholder id of 0 for every document,
  // so it has nothing addressable to point at until the turn is stored.
  const stored = !('pending' in message)

  for (const attachment of message.attachments ?? []) {
    parts.push({
      type: 'file',
      mediaType: attachment.mimeType,
      url:
        stored && attachment.id
          ? `/api/conversations/${message.conversationId}/messages/${message.id}/attachments/${attachment.id}`
          : undefined,
      filename: attachment.name,
      size: attachment.size,
    })
  }

  return parts
}

/**
 * Converts the transcript into the part based shape.
 *
 * A row with no parts at all is the assistant placeholder that is still
 * waiting for its first token. It is kept rather than dropped because
 * the transcript needs it to decide where the streaming indicator goes.
 */
export function toUiMessages(messages: ChatMessage[]): UiMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role,
    parts: toParts(message),
    metadata: {
      createdAt: message.createdAt,
      conversationId: message.conversationId,
      images: message.images ?? [],
      attachments: message.attachments ?? [],
      pending: 'pending' in message,
    },
  }))
}
