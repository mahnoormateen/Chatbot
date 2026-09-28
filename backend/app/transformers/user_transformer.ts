import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * Never exposes the password column.
 */
export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    return {
      id: this.resource.id,
      fullName: this.resource.fullName,
      email: this.resource.email,
      initials: this.resource.initials,
      createdAt: this.resource.createdAt,
    }
  }
}
