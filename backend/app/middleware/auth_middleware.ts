import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Rejects the request with a 401 response when the bearer token is
 * missing or invalid. "authenticate" throws an E_UNAUTHORIZED
 * exception, which the error handler turns into the HTTP response.
 */
export default class AuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.authenticate()

    return next()
  }
}
