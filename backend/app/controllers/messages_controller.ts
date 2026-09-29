import { Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { DEFAULT_CONVERSATION_TITLE } from '#consts'
import GeminiError from '#exceptions/gemini_error'
import Conversation from '#models/conversation'
import Message from '#models/message'
import GeminiService from '#services/gemini_service'
import MessageTransformer from '#transformers/message_transformer'
import { storeMessageValidator, MAX_IMAGE_DATA_LENGTH } from '#validators/message'
import type { ImageAttachment } from '#services/gemini_service'
import type User from '#models/user'

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
  payload: { content?: string; model?: string; images?: ImageAttachment[] },
  gemini: GeminiService
): Promise<PreparedTurn> {
  const conversation = await findOwnedConversation(user.id, conversationId)
  await conversation.load('messages', (query) => query.orderBy('id', 'asc'))

  const history = [...conversation.messages]

  /**
   * Content is optional so an image only message is allowed, but a turn
   * that has neither text nor an image is a mistake and gets refused.
   * The combined base64 budget is also checked here, because the body
   * parser limit is about the whole request while this bounds what the
   * model is asked to look at.
   */
  const images = payload.images ?? []
  const combined = images.reduce((total, image) => total + image.data.length, 0)

  if (!payload.content?.trim() && images.length === 0) {
    throw new Exception('A message needs some text or an image', {
      status: 422,
      code: 'E_EMPTY_TURN',
    })
  }

  if (combined > MAX_IMAGE_DATA_LENGTH * 3) {
    throw new Exception('The attached images are too large', {
      status: 413,
      code: 'E_IMAGES_TOO_LARGE',
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
 * Stores both halves of a turn together with the refreshed conversation
 * metadata inside one transaction, so a conversation can never end up
 * with a user message that has no answer. The streaming endpoint passes a
 * user message it already wrote, so the turn is visible while the answer
 * is still being produced.
 */
async function persistTurn(
  turn: PreparedTurn,
  options: {
    content: string
    reply: string
    model: string
    images?: ImageAttachment[]
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

    await conversation.load('messages', (query) => query.orderBy('id', 'asc'))

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

    const turn = await prepareTurn(user, params.conversationId, payload, gemini)

    /**
     * Gemini is asked before anything is written. If the upstream call
     * fails the conversation is left exactly as it was.
     */
    const reply = await gemini.generateReply({
      model: turn.model,
      prompt: payload.content ?? '',
      history: turn.history,
      images: payload.images,
    })

    const { userMessage, assistantMessage } = await persistTurn(turn, {
      content: payload.content ?? '',
      reply: reply.text,
      model: reply.model,
      images: payload.images,
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

    const turn = await prepareTurn(user, params.conversationId, payload, gemini)
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
         * Drop the orphaned user message so a failed turn leaves no
         * trace in the conversation.
         */
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
}
