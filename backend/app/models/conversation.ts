import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { ConversationSchema } from '#database/schema'
import Attachment from '#models/attachment'
import Message from '#models/message'
import User from '#models/user'

export default class Conversation extends ConversationSchema {
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @hasMany(() => Message, { foreignKey: 'conversationId' })
  declare messages: HasMany<typeof Message>

  /**
   * Attachments of every kind that belong to this conversation, staged
   * or claimed by a message. Loaded on delete so the files on disk are
   * removed alongside the rows.
   */
  @hasMany(() => Attachment, { foreignKey: 'conversationId' })
  declare attachments: HasMany<typeof Attachment>

  /**
   * Populated by the "withCount" query builder method.
   */
  declare messagesCount?: number
}
