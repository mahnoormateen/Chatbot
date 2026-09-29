import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'
import { DEFAULT_CONVERSATION_TITLE } from '#consts'
import Attachment from '#models/attachment'
import Conversation from '#models/conversation'
import AttachmentService from '#services/attachment_service'
import ConversationTransformer from '#transformers/conversation_transformer'
import ConversationDetailTransformer from '#transformers/conversation_detail_transformer'
import { createConversationValidator, updateConversationValidator } from '#validators/conversation'

/**
 * A route param arrives as text while the column is an integer. Passing a
 * malformed one straight to the database turns a client mistake into a
 * driver error, which is reported as a 500 carrying the failed query and
 * the Postgres error code. The bound is the range of a Postgres integer,
 * so an id that is well formed but could never exist is caught here too.
 */
function conversationIdFrom(id: string): number {
  const parsed = Number(id)

  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Exception('That conversation id is not valid', {
      status: 400,
      code: 'E_INVALID_ID',
    })
  }

  return parsed
}

/**
 * Every query is scoped to the authenticated user, so one user can
 * never read or mutate another user's conversations.
 */
function findOwnedConversation(userId: number, id: string) {
  return Conversation.query()
    .where('id', conversationIdFrom(id))
    .where('userId', userId)
    .firstOrFail()
}

export default class ConversationsController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()

    const conversations = await Conversation.query()
      .where('userId', user.id)
      .withCount('messages')
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')

    return await serialize(ConversationTransformer.transform(conversations))
  }

  async store({ auth, request, serialize, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createConversationValidator)

    const conversation = await Conversation.create({
      userId: user.id,
      title: payload.title || DEFAULT_CONVERSATION_TITLE,
      model: payload.model || env.get('GEMINI_MODEL'),
    })

    /**
     * The detail transformer reads the "messages" relation, so it has to
     * be loaded even for a brand new conversation.
     */
    await conversation.load('messages')

    return response
      .status(201)
      .send(await serialize(ConversationDetailTransformer.transform(conversation)))
  }

  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await findOwnedConversation(user.id, params.id)

    await conversation.load('messages', (query) =>
      query.orderBy('id', 'asc').preload('attachments')
    )

    return await serialize(ConversationDetailTransformer.transform(conversation))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateConversationValidator)
    const conversation = await findOwnedConversation(user.id, params.id)

    await conversation.merge(payload).save()

    return await serialize(ConversationTransformer.transform(conversation))
  }

  async destroy({ auth, params, response, containerResolver }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await findOwnedConversation(user.id, params.id)

    /**
     * Deleting the conversation cascades to its messages and attachment
     * rows, but the files on disk are removed separately, so a deleted
     * chat cannot leave its documents lying around.
     */
    const attachmentService = await containerResolver.make(AttachmentService)
    const attachments = await Attachment.query().where('conversationId', conversation.id)
    await attachmentService.destroyAll(attachments)

    await conversation.delete()

    return response.status(204)
  }
}
