import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import { loginValidator, registerValidator } from '#validators/user'

/**
 * Token based authentication. The API is stateless, so login and
 * register both return a bearer token the client stores and sends as
 * an "Authorization" header on every later request.
 */
export default class AuthController {
  async register({ request, serialize, response }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(registerValidator)

    const user = await User.create({ fullName, email, password })
    const token = await User.accessTokens.create(user)

    return response.status(201).send(
      await serialize({
        user: UserTransformer.transform(user),
        token: token.value!.release(),
      })
    )
  }

  async login({ request, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user)

    return await serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }

  async me({ auth, serialize }: HttpContext) {
    return await serialize(UserTransformer.transform(auth.getUserOrFail()))
  }

  async logout({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    return response.status(200).send({ message: 'Logged out successfully' })
  }
}
