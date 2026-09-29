import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { AttachmentSchema } from '#database/schema'
import Conversation from '#models/conversation'
import Message from '#models/message'

export default class Attachment extends AttachmentSchema {
  @belongsTo(() => Conversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof Conversation>

  /**
   * Null while the upload is staged and waiting for a turn to claim it.
   */
  @belongsTo(() => Message, { foreignKey: 'messageId' })
  declare message: BelongsTo<typeof Message>
}
