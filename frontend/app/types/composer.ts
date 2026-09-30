/**
 * Files waiting to be attached to the turn being composed.
 *
 * They are already read into memory as base64 because that is the only
 * shape the streaming endpoint accepts, and because holding the bytes
 * locally means a drop and a paste behave exactly like a file picker.
 */

/** An image chosen for the next turn, held as a data URI. */
export interface StagedImage {
  /** Stable key for the list, so removing one does not shuffle the rest. */
  key: string
  name: string
  /** "data:image/png;base64,..." ready for an <img src>. */
  src: string
  /** The raw base64, without the header, as the API expects it. */
  data: string
  mimeType: string
  size: number
}

/** A PDF chosen for the next turn, held as base64. */
export interface StagedPdf {
  key: string
  name: string
  data: string
  size: number
}
