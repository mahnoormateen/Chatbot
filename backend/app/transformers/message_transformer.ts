import type Message from '#models/message'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class MessageTransformer extends BaseTransformer<Message> {
  toObject() {
    return {
      id: this.resource.id,
      conversationId: this.resource.conversationId,
      role: this.resource.role,
      content: this.resource.content,
      images: this.resource.images ?? [],
      createdAt: this.resource.createdAt,
    }
  }
}
