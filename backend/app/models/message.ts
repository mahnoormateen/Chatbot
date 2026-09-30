import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { MessageSchema } from '#database/schema'
import type { ImageAttachment } from '#services/gemini_service'
import Attachment from '#models/attachment'
import Conversation from '#models/conversation'

export default class Message extends MessageSchema {
  /**
   * Re-declared so the generated jsonb column round-trips correctly:
   * "prepare" serializes the array to JSON before the insert, because the
   * pg driver would otherwise encode a JS array as a Postgres array
   * literal, which is not valid JSON. Reads need no hook: the driver
   * already parses jsonb back into objects.
   *
   * Both null and undefined are named rather than a loose equality:
   * Lucid hands back undefined for a column that was never set, and a
   * turn with no images must store SQL NULL, not the string "undefined".
   */
  @column({
    prepare: (value: ImageAttachment[] | null) =>
      value === null || value === undefined ? null : JSON.stringify(value),
  })
  declare images: ImageAttachment[] | null

  @hasMany(() => Attachment, { foreignKey: 'messageId' })
  declare attachments: HasMany<typeof Attachment>

  @belongsTo(() => Conversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof Conversation>
}
