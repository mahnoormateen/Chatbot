import { Exception } from '@adonisjs/core/exceptions'

/**
 * Raised when the Gemini API cannot fulfil a request.
 *
 * The service translates every SDK error into this exception so the HTTP
 * layer never has to know about the Gemini SDK. It defaults to a
 * "502 Bad Gateway" status because the failure comes from an upstream
 * service and not from the client request.
 */
export default class GeminiError extends Exception {
  static status = 502
  static code = 'E_GEMINI_ERROR'
}
