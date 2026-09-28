import vine from '@vinejs/vine'

/**
 * Title and model are optional on create, the controller falls back to
 * sensible defaults when they are omitted.
 */
export const createConversationValidator = vine.create({
  title: vine.string().trim().minLength(1).maxLength(120).optional(),
  model: vine.string().trim().minLength(1).maxLength(128).optional(),
})

/**
 * Both fields are optional on update, only the submitted ones change.
 */
export const updateConversationValidator = vine.create({
  title: vine.string().trim().minLength(1).maxLength(120).optional(),
  model: vine.string().trim().minLength(1).maxLength(128).optional(),
})
