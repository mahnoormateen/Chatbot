import vine from '@vinejs/vine'

/**
 * Image mime types the model families used by this app can read. The
 * Gemini API accepts JPEG, PNG, WebP, HEIC and HEIF; everything else is
 * rejected before it reaches the database.
 */
const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/**
 * Upper bound for every field that travels as base64. 8M characters is
 * roughly a 6 MB image, which is plenty for a chat attachment and well
 * within the JSON body limit configured in config/bodyparser.ts.
 */
export const MAX_IMAGE_DATA_LENGTH = 8_000_000

/**
 * Upper bound for the base64 of one PDF. 11.2M characters is roughly an
 * 8 MB document, matching the per-file ceiling in config/gemini.ts. The
 * service decodes and re-measures, so this only rejects the obviously
 * oversized early.
 */
export const MAX_PDF_DATA_LENGTH = 11_200_000

/** A PDF the client wants to attach to the turn it is sending. */
export type PdfAttachmentInput = {
  name: string
  data: string
}

/**
 * Validator for editing a message that has already been sent.
 *
 * Only the text changes. The images and documents that went out with the
 * original turn stay on the message, so there is nothing to accept for
 * them here: re-uploading the same file would only produce a second copy
 * of bytes that are already stored.
 *
 * Content is required rather than optional, unlike on a fresh turn. An
 * edited turn keeps whatever it was attached to, so it is never a
 * message that carries nothing but files.
 */
export const editMessageValidator = vine.create({
  content: vine.string().trim().minLength(1).maxLength(32_000),
  model: vine.string().trim().minLength(1).maxLength(128).optional(),
})

/**
 * Validator for sending a chat message.
 *
 * Content is optional because a message may carry only images or a PDF,
 * but the controller rejects a payload with none of them, so an empty
 * turn can never be sent. The model stays optional so the conversation
 * default is used when it is omitted.
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
  pdfs: vine
    .array(
      vine.object({
        name: vine.string().trim().minLength(1).maxLength(255),
        data: vine.string().trim().minLength(1).maxLength(MAX_PDF_DATA_LENGTH),
      })
    )
    .maxLength(3)
    .optional(),
})
