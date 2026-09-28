import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { UserSchema } from '#database/schema'

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  /**
   * Provider used to create, verify and revoke access tokens.
   */
  static accessTokens = DbAccessTokensProvider.forModel(User)

  /**
   * The token used for the current request. Set by the auth package
   * when the "api" guard resolves a user.
   */
  declare currentAccessToken?: AccessToken

  /**
   * Two letter avatar fallback, derived from the full name or email.
   */
  get initials(): string {
    const source = this.fullName || this.email
    return source.slice(0, 2).toUpperCase()
  }
}
