import vine from '@vinejs/vine'

/**
 * Validator for sending a chat message. The model is optional so the
 * conversation default is used when it is omitted.
 */
export const storeMessageValidator = vine.create({
  content: vine.string().trim().minLength(1).maxLength(32_000),
  model: vine.string().trim().minLength(1).maxLength(128).optional(),
})
