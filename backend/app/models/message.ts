import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { MessageSchema } from '#database/schema'
import Conversation from '#models/conversation'

export default class Message extends MessageSchema {
  @belongsTo(() => Conversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof Conversation>
}
