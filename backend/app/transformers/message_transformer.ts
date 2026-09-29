import type Attachment from '#models/attachment'
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
      attachments: (this.resource.attachments as Attachment[] | undefined)?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })) ?? [],
      createdAt: this.resource.createdAt,
    }
  }
}
