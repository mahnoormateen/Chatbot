import { Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { DEFAULT_CONVERSATION_TITLE } from '#consts'
import GeminiError from '#exceptions/gemini_error'
import Attachment from '#models/attachment'
import Conversation from '#models/conversation'
import Message from '#models/message'
import AttachmentService from '#services/attachment_service'
import GeminiService from '#services/gemini_service'
import MessageTransformer from '#transformers/message_transformer'
import { storeMessageValidator, type PdfAttachmentInput } from '#validators/message'
import type { ImageAttachment } from '#services/gemini_service'
import type User from '#models/user'

/**
 * Raw bytes that may ride in one turn, combined across images and PDFs,
 * base64 inflation already accounted for by the per-file validator caps.
 * Kept under the inline request ceiling the Gemini API applies so that a
 * turn cannot fail upstream just because of what it carries.
 */
const MAX_TOTAL_INLINE_BYTES = 14 * 1024 * 1024

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
 * Scopes a conversation lookup to the authenticated user.
 */
function findOwnedConversation(userId: number, id: string) {
  return Conversation.query()
    .where('id', conversationIdFrom(id))
    .where('userId', userId)
    .firstOrFail()
}

/**
 * Everything a turn needs before Gemini is asked for an answer. Nothing
 * is written to the database yet, so a failing upstream call cannot leave
 * a user message stranded without a reply.
 */
type PreparedTurn = {
  conversation: Conversation
  history: Message[]
  isFirstTurn: boolean
  model: string
}

async function prepareTurn(
  user: User,
  conversationId: string,
  payload: {
    content?: string
    model?: string
    images?: ImageAttachment[]
    pdfs?: PdfAttachmentInput[]
  },
  gemini: GeminiService
): Promise<PreparedTurn> {
  const conversation = await findOwnedConversation(user.id, conversationId)

  /**
   * "attachments" is preloaded so the turn the model is about to answer
   * includes the documents attached to earlier messages.
   */
  await conversation.load('messages', (query) =>
    query.orderBy('id', 'asc').preload('attachments')
  )

  const history = [...conversation.messages]

  /**
   * Content is optional so an image or PDF only message is allowed, but a
   * turn with none of them is a mistake and gets refused. The combined
   * base64 budget is also checked here, because the body parser limit is
   * about the whole request while this bounds what the model is asked to
   * look at in one go.
   */
  const images = payload.images ?? []
  const pdfs = payload.pdfs ?? []

  if (!payload.content?.trim() && images.length === 0 && pdfs.length === 0) {
    throw new Exception('A message needs some text, an image or a PDF', {
      status: 422,
      code: 'E_EMPTY_TURN',
    })
  }

  const rawImageBytes = images.reduce((total, image) => total + (image.data.length * 3) / 4, 0)
  const rawPdfBytes = pdfs.reduce(
    (total, pdf) => total + Buffer.from(pdf.data, 'base64').length,
    0
  )

  if (rawImageBytes + rawPdfBytes > MAX_TOTAL_INLINE_BYTES) {
    throw new Exception('The attached files are too large together', {
      status: 413,
      code: 'E_FILES_TOO_LARGE',
    })
  }

  /**
   * The default is resolved against the models this key can actually
   * call, so it is only asked for when neither the request nor an
   * existing conversation named one.
   */
  const model = payload.model || conversation.model || (await gemini.defaultModel())

  return {
    conversation,
    history,
    isFirstTurn: history.length === 0,
    model,
  }
}

/**
 * Writes the PDFs of a turn to disk through the attachment service and
 * returns their rows. Called before Gemini is asked, so the model reads
 * them from where they landed. The rows stay unclaimed (no message id)
 * until the turn persists; a failing turn is cleaned up again by
 * "discardTurnAttachments".
 */
async function storeTurnAttachments(
  service: AttachmentService,
  conversationId: number,
  pdfs: PdfAttachmentInput[] | undefined
): Promise<Attachment[]> {
  if (!pdfs?.length) return []

  const rows: Attachment[] = []
  for (const pdf of pdfs) {
    rows.push(await service.storeFromBase64(conversationId, pdf.name, pdf.data))
  }

  return rows
}

/**
 * Removes the files and the rows of attachments that a turn created but
 * never persisted, restoring the state before the turn started.
 */
async function discardTurnAttachments(
  service: AttachmentService,
  rows: Attachment[]
): Promise<void> {
  if (!rows.length) return

  await service.destroyAll(rows).catch(() => {})

  for (const row of rows) {
    await row.delete().catch(() => {})
  }
}

/**
 * Stores both halves of a turn together with the refreshed conversation
 * metadata inside one transaction, so a conversation can never end up
 * with a user message that has no answer. The streaming endpoint passes a
 * user message it already wrote, so the turn is visible while the answer
 * is still being produced.
 *
 * Attachments that belong to the turn are claimed here: their message id
 * is filled in inside the same transaction that writes the messages.
 */
async function persistTurn(
  turn: PreparedTurn,
  options: {
    content: string
    reply: string
    model: string
    images?: ImageAttachment[]
    attachments?: Attachment[]
    userMessage?: Message
  }
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const { conversation } = turn

  return db.transaction(async (trx) => {
    const userMessage =
      options.userMessage ??
      (await Message.create(
        {
          conversationId: conversation.id,
          role: 'user',
          content: options.content,
          images: options.images ?? [],
        },
        { client: trx }
      ))

    if (options.attachments?.length) {
      for (const attachment of options.attachments) {
        attachment.messageId = userMessage.id
        attachment.useTransaction(trx)
        await attachment.save()
      }
    }

    const assistantMessage = await Message.create(
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: options.reply,
      },
      { client: trx }
    )

    /**
     * Title the thread from its first message and remember which model
     * actually answered, so the sidebar and the picker stay accurate.
     * The answering model can differ from the requested one when the
     * service had to fail over, so the resolved value is stored.
     */
    if (turn.isFirstTurn && conversation.title === DEFAULT_CONVERSATION_TITLE) {
      conversation.title = options.content.trim().slice(0, 60) || 'Shared an image'
    }
    conversation.model = options.model
    conversation.useTransaction(trx)
    await conversation.save()

    return { userMessage, assistantMessage }
  })
}

export default class MessagesController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await findOwnedConversation(user.id, params.conversationId)

    await conversation.load('messages', (query) =>
      query.orderBy('id', 'asc').preload('attachments')
    )

    return serialize(MessageTransformer.transform(conversation.messages))
  }

  /**
   * Asks Gemini for a reply using the conversation history and stores the
   * resulting turn. Both messages are returned so the client can render
   * them in one pass.
   */
  async store({ auth, params, request, serialize, response, containerResolver }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(storeMessageValidator)
    const gemini = await containerResolver.make(GeminiService)
    const attachmentService = await containerResolver.make(AttachmentService)

    const turn = await prepareTurn(user, params.conversationId, payload, gemini)
    const attachments = await storeTurnAttachments(
      attachmentService,
      turn.conversation.id,
      payload.pdfs
    )

    try {
      /**
       * Gemini is asked before anything is written. If the upstream call
       * fails the conversation is left exactly as it was, and the files
       * that were written for this turn are removed again.
       */
      const reply = await gemini.generateReply({
        model: turn.model,
        prompt: payload.content ?? '',
        history: turn.history,
        images: payload.images,
        attachments,
        attachmentService,
      })

      const { userMessage, assistantMessage } = await persistTurn(turn, {
        content: payload.content ?? '',
        reply: reply.text,
        model: reply.model,
        images: payload.images,
        attachments,
      })

      /**
       * "serialize" is async, so it has to be awaited before being handed
       * to "send". A promise is not unwrapped by the response layer and
       * would end up on the wire as an empty object.
       */
      const body = await serialize({
        model: reply.model,
        userMessage: MessageTransformer.transform(userMessage),
        assistantMessage: MessageTransformer.transform(assistantMessage),
      })

      return response.status(201).send(body)
    } catch (error) {
      await discardTurnAttachments(attachmentService, attachments)
      throw error
    }
  }

  /**
   * Same as "store", but the answer is streamed back as server sent
   * events while Gemini produces it:
   *
   *   data: {"chunk":"Hello"}
   *   data: {"chunk":" world"}
   *   data: {"done":true,"message":{...}}
   *
   * The user message is written up front so the turn is visible straight
   * away. It is removed again if the stream fails, keeping the turn
   * atomic in the same way the buffered endpoint is.
   */
  async stream({
    auth,
    params,
    request,
    containerResolver,
    response,
    logger,
    serialize,
  }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(storeMessageValidator)
    const gemini = await containerResolver.make(GeminiService)
    const attachmentService = await containerResolver.make(AttachmentService)

    const turn = await prepareTurn(user, params.conversationId, payload, gemini)
    const attachments = await storeTurnAttachments(
      attachmentService,
      turn.conversation.id,
      payload.pdfs
    )
    const userMessage = await Message.create({
      conversationId: turn.conversation.id,
      role: 'user',
      content: payload.content ?? '',
      images: payload.images ?? [],
    })

    const events = (async function* () {
      let full = ''
      let resolvedModel = turn.model

      try {
        /**
         * The handshake happens inside the generator so that a total
         * failure is reported as a stream error event and the orphaned
         * user message is cleaned up below, exactly like a failure that
         * happens mid stream.
         */
        const opened = await gemini.openStream({
          model: turn.model,
          prompt: payload.content ?? '',
          history: turn.history,
          images: payload.images,
          attachments,
          attachmentService,
        })
        resolvedModel = opened.model

        for await (const chunk of opened.chunks) {
          full += chunk
          yield `data: ${JSON.stringify({ chunk })}\n\n`
        }

        const { assistantMessage } = await persistTurn(turn, {
          content: payload.content ?? '',
          reply: full.trim(),
          userMessage,
          model: resolvedModel,
          attachments,
        })

        /**
         * The transformer instance is not JSON friendly, so it has to
         * be resolved to a plain object first. "withoutWrapping" is
         * used because each SSE event already carries its own keys.
         */
        const message = await serialize.withoutWrapping(
          MessageTransformer.transform(assistantMessage)
        )

        yield `data: ${JSON.stringify({
          done: true,
          model: resolvedModel,
          message,
        })}\n\n`
      } catch (error) {
        /**
         * Drop the orphaned user message and unclaim the attachments of
         * this turn so a failed stream leaves no trace in the
         * conversation.
         */
        await discardTurnAttachments(attachmentService, attachments)

        await userMessage.delete().catch((deleteError) => {
          logger.error({ err: deleteError }, 'Unable to remove the failed user message')
        })

        logger.error({ err: error }, 'Unable to finish the Gemini answer stream')

        /**
         * The status is forwarded so the client can tell a rate limit
         * apart from an unusable model and give useful advice. The
         * message itself stays generic because the upstream detail is
         * not meant for end users.
         */
        const status = error instanceof GeminiError ? error.status : undefined

        yield `data: ${JSON.stringify({
          error: 'Unable to generate a reply',
          status,
        })}\n\n`
      }
    })()

    response
      .safeHeader('Content-Type', 'text/event-stream; charset=utf-8')
      .safeHeader('Cache-Control', 'no-cache, no-transform')
      .safeHeader('Connection', 'keep-alive')
      .safeHeader('X-Accel-Buffering', 'no')

    return response.stream(Readable.from(events), (error) => {
      /**
       * The response has already been sent, so the only thing left to do
       * is to record why the stream was cut short.
       */
      logger.error({ err: error }, 'Gemini answer stream closed unexpectedly')
      return ['Unable to stream the answer', 500]
    })
  }

  /**
   * Serves the bytes of a stored attachment back to an authenticated
   * browser tab. The row has to belong to the message and the message to
   * the conversation, and the whole chain is scoped to the user, so one
   * user can never reach another user's file. Only claimed attachments
   * (those already sent with a turn) are reachable here.
   */
  async attachmentFile({ auth, params, response, containerResolver }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversationId = conversationIdFrom(params.conversationId)
    const messageId = conversationIdFrom(params.messageId)
    const attachmentId = conversationIdFrom(params.attachmentId)

    const attachment = await Attachment.query()
      .where('id', attachmentId)
      .where('conversationId', conversationId)
      .where('messageId', messageId)
      .firstOrFail()

    await findOwnedConversation(user.id, String(conversationId))

    const attachmentService = await containerResolver.make(AttachmentService)

    const safeName = attachment.name.replace(/["\r\n]/g, '_')
    response.type(attachment.mimeType)
    response.header('Content-Disposition', `inline; filename="${safeName}"`)

    return response.stream(await attachmentService.stream(attachment))
  }
}
