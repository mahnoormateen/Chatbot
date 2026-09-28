/**
 * Turns whatever the API, the network, or the browser throws into
 * something worth showing a person.
 *
 * The backend bodies are not user facing. AdonisJS sends Lucid internals
 * on a 404 ("Row not found") and a generic sentence on a rate limit
 * ("Gemini could not complete the request"), so the status is what
 * actually carries the meaning and is mapped here. Validation messages
 * come from Vine and are already written for humans, so those are
 * surfaced as they are.
 */

/** A short headline plus the sentence underneath it. */
export interface FriendlyError {
  title: string
  detail: string
  /** One line per problem, used for validation failures. */
  items: string[]
  /** Whether offering a "try again" button makes sense. */
  retryable: boolean
}

/** Narrows an unknown throw to the parts the API client exposes. */
type ApiLike = {
  name?: string
  status?: number
  message?: string
  /** AdonisJS error code, for example "E_ROW_NOT_FOUND". */
  code?: string
  /** Name of the offending field on a Vine validation error. */
  field?: string
  errors?: unknown
}

function isApiLike(value: unknown): value is ApiLike {
  return typeof value === 'object' && value !== null
}

/**
 * Pulls the validation messages out of an AdonisJS error body.
 *
 * Vine sends `{ errors: [{ message, rule, field }] }`, so every entry
 * usually names the field that caused it. A body that only has a single
 * `message` is treated as a one line list.
 */
export function validationMessages(body: unknown): string[] {
  if (!isApiLike(body)) return []

  if (Array.isArray(body.errors)) {
    return body.errors
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim()
        if (!isApiLike(entry)) return ''
        const message = typeof entry.message === 'string' ? entry.message : ''
        // Fall back to the field name so a bodiless error is still useful.
        return message.trim() || (typeof entry.field === 'string' ? entry.field : '')
      })
      .filter((entry) => entry.length > 0)
  }

  return []
}

/** The error code AdonisJS uses for its own failures, e.g. "E_ROW_NOT_FOUND". */
function codeOf(value: unknown): string {
  return isApiLike(value) && typeof value.code === 'string' ? value.code : ''
}

/** The message AdonisJS put in the body, ignoring an empty one. */
function messageOf(value: unknown): string {
  if (!isApiLike(value)) return ''
  return typeof value.message === 'string' ? value.message.trim() : ''
}

/**
 * True when the errors name the field that caused them, which is what
 * distinguishes a form rejection ("The email has already been taken",
 * field: "email") from a plain refusal ("Invalid user credentials",
 * no field). The first wants a per-field list, the second a single
 * sentence and a different headline.
 */
export function hasFieldedErrors(body: unknown): boolean {
  if (!isApiLike(body) || !Array.isArray(body.errors)) return false

  return body.errors.some((entry) => isApiLike(entry) && typeof entry.field === 'string')
}

/**
 * Builds a displayable error. "caught" is the thrown value, "context"
 * narrows the wording.
 *
 * "scope" matters because the same status means different things in
 * different places. A 404 while sending means the model is not
 * available, while a 404 while reading a conversation means the
 * conversation is gone. Likewise a 429 only reaches the client after the
 * backend has already tried its fallback models, so telling the reader to
 * pick a different model would be misleading.
 */
export function toFriendlyError(
  caught: unknown,
  context: { model?: string; action?: string; title?: string; scope?: 'send' | 'read' } = {}
): FriendlyError {
  const fallbackDetail = context.action
    ? `Something went wrong while ${context.action}.`
    : 'Something went wrong. Please try again.'

  if (!isApiLike(caught)) {
    const detail = caught instanceof Error && caught.message ? caught.message : ''
    return {
      title: 'Unexpected error',
      detail: detail || fallbackDetail,
      items: [],
      retryable: true,
    }
  }

  const status = typeof caught.status === 'number' ? caught.status : undefined
  const body = caught.errors
  const validation = validationMessages(body)
  const code = codeOf(body)

  /**
   * A fielded error is the most specific thing known: it names the input
   * that has to change, so it is shown before anything the status can
   * tell us. A bare sentence is left for later, because a 401 carrying
   * "Unauthorized access" should still be reported as an ended session.
   */
  if (validation.length > 0 && hasFieldedErrors(body)) {
    return {
      title: validation.length > 1 ? 'Fix these details' : 'Check the form',
      detail:
        validation.length > 1
          ? 'The request was rejected because of the following:'
          : validation[0]!,
      items: validation.length > 1 ? validation : [],
      retryable: false,
    }
  }

  const model = context.model

  /**
   * No status at all means the failure never reached the API layer, so
   * it is a bug in the client rather than a server refusal. Reporting
   * this as a connection problem would send the reader to the wrong
   * place.
   */
  if (status === undefined) {
    const detail = messageOf(caught)
    return {
      title: 'Unexpected error',
      detail: detail || fallbackDetail,
      items: [],
      retryable: true,
    }
  }

  if (status === 0) {
    return {
      title: 'Cannot reach the server',
      detail:
        'The API did not respond. Check that the backend is running and that the address in NUXT_PUBLIC_API_BASE is correct.',
      items: [],
      retryable: true,
    }
  }

  if (status === 401 || status === 403) {
    return {
      title: 'Your session has ended',
      detail: 'Sign in again to pick up where you left off.',
      items: [],
      retryable: false,
    }
  }

  if (status === 404) {
    /**
     * The backend does not fail over on a 404, so while sending it can
     * only mean the requested model is not available to this key.
     */
    if (context.scope === 'send') {
      return {
        title: 'Model not available',
        detail: model
          ? `${model} is not available on this account. Pick another model from the list.`
          : 'That model is not available. Pick another one from the list.',
        items: [],
        retryable: false,
      }
    }

    return {
      title: 'Not found',
      detail:
        code === 'E_ROW_NOT_FOUND'
          ? 'That conversation no longer exists. It may have been deleted.'
          : 'We could not find what you asked for.',
      items: [],
      retryable: false,
    }
  }

  if (status === 429) {
    /**
     * Every configured model is retried before a 429 is reported, so
     * switching models here would not help. The honest advice is to wait
     * or to look at the plan limits.
     */
    return {
      title: 'Quota used up',
      detail: model
        ? `${model} is rate limited, and the backup models are too. Wait a few minutes, or check your Gemini plan limits.`
        : 'Every available model is rate limited right now. Wait a few minutes and try again.',
      items: [],
      retryable: true,
    }
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      title: 'Gemini is not responding',
      detail: model
        ? `${model} could not be reached, and neither could the backup models. Try again in a moment.`
        : 'The model could not be reached. Try again in a moment.',
      items: [],
      retryable: true,
    }
  }

  if (status >= 500) {
    return {
      title: 'Server problem',
      detail: 'The backend hit an unexpected error. Try again shortly.',
      items: [],
      retryable: true,
    }
  }

  /**
   * Only statuses without a dedicated meaning above reach this point, so
   * a bare refusal such as "Invalid user credentials" is reported as
   * the server worded it. The caller's headline is preferred so a sign
   * in failure is not labelled "Request failed".
   */
  if (validation.length > 0) {
    return {
      title: context.title ?? 'Request failed',
      detail: validation.join(' '),
      items: [],
      retryable: false,
    }
  }

  // Anything else: prefer what the server said, but never show a blank
  // or a leaked internal name.
  const detail = messageOf(body)
  const safe = detail && !/^E_[A-Z_]+$/.test(detail) ? detail : ''

  return {
    title: context.title ?? 'Request failed',
    detail: safe || fallbackDetail,
    items: [],
    retryable: true,
  }
}
