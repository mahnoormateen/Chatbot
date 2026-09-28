import vine from '@vinejs/vine'

/**
 * Shared rules for the email field.
 */
const email = () => vine.string().trim().email().maxLength(254)

/**
 * Bcrypt truncates at 72 bytes, so we cap the password length there.
 */
const password = () => vine.string().minLength(8).maxLength(72)

/**
 * Validator used when creating a new account.
 */
export const registerValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(120).nullable(),
  email: email().unique({ table: 'users', column: 'email' }),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})

/**
 * Validator used before checking credentials during login.
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})
