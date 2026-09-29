import vine from '@vinejs/vine'

/**
 * Image mime types the model families used by this app can read. The
 * Gemini API accepts JPEG, PNG, WebP, HEIC and HEIF; everything else is
 * rejected before it reaches the database.
 */
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

/**
 * Upper bound for every field that travels as base64. 8M characters is
 * roughly a 6 MB image, which is plenty for a chat attachment and well
 * within the JSON body limit configured in config/bodyparser.ts.
 */
export const MAX_IMAGE_DATA_LENGTH = 8_000_000

/**
 * Validator for sending a chat message.
 *
 * Content is now optional because a message may carry only images. The
 * controller rejects a payload that has neither, so an empty turn can
 * never be sent. The model stays optional so the conversation default is
 * used when it is omitted.
 */
export const storeMessageValidator = vine.create({
  content: vine.string().trim().maxLength(32_000).optional(),
  model: vine.string().trim().minLength(1).maxLength(128).optional(),
  images: vine
    .array(
      vine.object({
        mimeType: vine.enum(IMAGE_MIME_TYPES),
        data: vine.string().trim().minLength(1).maxLength(MAX_IMAGE_DATA_LENGTH),
      })
    )
    .maxLength(3)
    .optional(),
})