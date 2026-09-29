import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { MessageSchema } from '#database/schema'
import type { ImageAttachment } from '#services/gemini_service'
import Conversation from '#models/conversation'

export default class Message extends MessageSchema {
  /**
   * Re-declared so the generated jsonb column round-trips correctly:
   * "prepare" serializes the array to JSON before the insert, because the
   * pg driver would otherwise encode a JS array as a Postgres array
   * literal, which is not valid JSON. Reads need no hook: the driver
   * already parses jsonb back into objects.
   */
  @column({
    prepare: (value: ImageAttachment[] | null) => (value == null ? null : JSON.stringify(value)),
  })
  declare images: ImageAttachment[] | null

  @belongsTo(() => Conversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof Conversation>
}
