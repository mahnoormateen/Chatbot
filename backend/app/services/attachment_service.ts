import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'
import { geminiConfig } from '#config/gemini'
import Attachment from '#models/attachment'

/**
 * One inline document part, shaped the way the API wants it.
 */
export type InlinePart = { inlineData: { mimeType: string; data: string } }

/**
 * Stores the bytes of an uploaded document next to the project and keeps
 * the metadata in the database.
 *
 * Files live on disk rather than in a column because a PDF is binary and
 * large, and because the API wants base64, which is derived at read time
 * rather than stored a second time.
 *
 * Nothing here is reachable by name: the path on disk is generated, so an
 * upload cannot choose where it lands or collide with another file.
 */
export default class AttachmentService {
  #root: string

  constructor() {
    /**
     * Resolved against the backend directory, so a relative value in .env
     * means the same thing no matter which directory the process was
     * started from.
     */
    const configured = env.get('ATTACHMENT_STORAGE_PATH')
    this.#root = resolve(import.meta.dirname, '..', configured ?? 'storage/attachments')
  }

  /**
   * Accepts one multipart upload, rejecting anything that is not a PDF of
   * an acceptable size before the bytes are copied into the store.
   */
  async store(
    conversationId: number,
    file: { originalName?: string; tmpPath?: string; size?: number; mimeType?: string }
  ): Promise<Attachment> {
    const name = (file.originalName ?? '').trim()
    const tmpPath = file.tmpPath
    const declaredSize = Number(file.size ?? 0)

    if (!name) {
      throw new Exception('The upload has no file name', { status: 422, code: 'E_NO_FILE_NAME' })
    }

    if (!tmpPath) {
      throw new Exception('The upload has no contents', { status: 422, code: 'E_NO_FILE_BODY' })
    }

    /**
     * The browser supplied mime type is attacker controlled, so the
     * extension decides. It is the only thing that reaches the API, and
     * the API dispatches on it.
     */
    if (!name.toLowerCase().endsWith('.pdf')) {
      throw new Exception('Only PDF files can be attached', {
        status: 422,
        code: 'E_UNSUPPORTED_FILE_TYPE',
      })
    }

    const { maxFileSizeBytes, maxPerMessage } = geminiConfig.attachments

    /**
     * The size on disk is measured rather than trusted, so a lying
     * content-length cannot get a large file past the limit.
     */
    const actual = await stat(tmpPath).then(
      (info) => info.size,
      () => 0
    )

    if (actual < 1) {
      throw new Exception('That PDF is empty or unreadable', {
        status: 422,
        code: 'E_EMPTY_FILE',
      })
    }

    if (actual > maxFileSizeBytes) {
      throw new Exception(`That PDF is larger than the ${mb(maxFileSizeBytes)} MB limit`, {
        status: 422,
        code: 'E_FILE_TOO_LARGE',
      })
    }

    /**
     * Checked before storing, so the limit is enforced against the
     * conversation as a whole rather than one upload at a time.
     */
    const attached = await Attachment.query()
      .where('conversationId', conversationId)
      .whereNull('messageId')
      .count('* as total')
      .firstOrFail()

    const total = Number(attached.$extras.total ?? 0)
    if (total >= maxPerMessage) {
      throw new Exception(`At most ${maxPerMessage} PDFs can be attached to a message`, {
        status: 422,
        code: 'E_TOO_MANY_FILES',
      })
    }

    /**
     * A PDF that does not start with the PDF header is rejected here
     * rather than being forwarded, since a renamed file would otherwise
     * reach the API as a document it cannot read.
     */
    const contents = await readFile(tmpPath)
    if (contents.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Exception('That file is not a PDF', {
        status: 422,
        code: 'E_NOT_A_PDF',
      })
    }

    void declaredSize

    const relativePath = join(randomBytes(2).toString('hex'), `${randomBytes(16).toString('hex')}.pdf`)
    const target = this.#absolute(relativePath)

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, contents)

    return Attachment.create({
      conversationId,
      name: name.slice(0, 255),
      mimeType: 'application/pdf',
      size: actual,
      path: relativePath,
    })
  }

  /**
   * Reads a stored file back as the base64 payload the API expects.
   */
  async toInlinePart(attachment: Attachment): Promise<InlinePart> {
    const bytes = await readFile(this.#absolute(attachment.path))

    return {
      inlineData: {
        mimeType: attachment.mimeType,
        data: bytes.toString('base64'),
      },
    }
  }

  /**
   * Inline parts for every attachment of a turn.
   *
   * A file whose bytes have gone missing is skipped rather than thrown,
   * so one stale row cannot fail an otherwise answerable question.
   */
  async toInlineParts(attachments: Attachment[]): Promise<InlinePart[]> {
    const parts: InlinePart[] = []

    for (const attachment of attachments) {
      const part = await this.toInlinePart(attachment).catch(() => null)
      if (part) parts.push(part)
    }

    return parts
  }

  /**
   * Total bytes that would be sent inline for a set of attachments, used
   * to keep a turn inside the request limit the API enforces.
   */
  totalSize(attachments: Attachment[]): number {
    return attachments.reduce((sum, attachment) => sum + attachment.size, 0)
  }

  async stream(attachment: Attachment) {
    return createReadStream(this.#absolute(attachment.path))
  }

  async destroy(attachment: Attachment): Promise<void> {
    await this.#discard(attachment.path)
    await attachment.delete()
  }

  /**
   * Removes the bytes of a set of attachments. Used from the delete
   * path: the rows go with the database cascade, the files would not.
   */
  async destroyAll(attachments: Attachment[]): Promise<void> {
    for (const attachment of attachments) {
      await this.#discard(attachment.path)
    }
  }

  #absolute(relativePath: string): string {
    return join(this.#root, relativePath)
  }

  async #discard(relativePath: string): Promise<void> {
    await unlink(this.#absolute(relativePath)).catch(() => undefined)
  }
}

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}
