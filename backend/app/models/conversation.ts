import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { ConversationSchema } from '#database/schema'
import Message from '#models/message'
import User from '#models/user'

export default class Conversation extends ConversationSchema {
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @hasMany(() => Message, { foreignKey: 'conversationId' })
  declare messages: HasMany<typeof Message>

  /**
   * Populated by the "withCount" query builder method.
   */
  declare messagesCount?: number
}
