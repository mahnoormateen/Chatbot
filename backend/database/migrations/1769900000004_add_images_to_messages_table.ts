import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Images attached to a user message. Each entry is
       * { mimeType, data } where "data" is the raw base64 payload (no
       * "data:" header), stored as JSON so a message can carry several.
       * Null for the messages created before this column existed.
       */
      table.jsonb('images').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('images')
    })
  }
}