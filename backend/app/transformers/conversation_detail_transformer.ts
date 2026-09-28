import type Conversation from '#models/conversation'
import { BaseTransformer } from '@adonisjs/core/transformers'
import MessageTransformer from '#transformers/message_transformer'

/**
 * Full representation of a conversation including its messages.
 * Requires the "messages" relation to be preloaded.
 */
export default class ConversationDetailTransformer extends BaseTransformer<Conversation> {
  toObject() {
    return {
      id: this.resource.id,
      title: this.resource.title,
      model: this.resource.model,
      messageCount: this.resource.messagesCount ?? this.resource.messages.length,
      createdAt: this.resource.createdAt,
      updatedAt: this.resource.updatedAt,
      /**
       * The whole array is handed to the transformer so it becomes a
       * "collection" resource. Mapping by hand would leave a plain array
       * of transformer instances behind, which the serializer does not
       * unpack and would leak onto the wire.
       */
      messages: MessageTransformer.transform(this.whenLoaded(this.resource.messages)),
    }
  }
}
