import type Conversation from '#models/conversation'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * Summary representation used by the conversation list.
 */
export default class ConversationTransformer extends BaseTransformer<Conversation> {
  toObject() {
    return {
      id: this.resource.id,
      title: this.resource.title,
      model: this.resource.model,
      messageCount: this.resource.messagesCount ?? 0,
      createdAt: this.resource.createdAt,
      updatedAt: this.resource.updatedAt,
    }
  }
}
