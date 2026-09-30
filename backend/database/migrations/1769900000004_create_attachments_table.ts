import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'attachments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      /**
       * An upload lands here before the turn that references it exists,
       * so the conversation is what it belongs to and the message is
       * filled in when the turn is persisted. A file that is uploaded and
       * never sent is swept away by conversation deletion or by age.
       */
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('conversations')
        .onDelete('CASCADE')

      table
        .integer('message_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('messages')
        .onDelete('CASCADE')

      /** Original file name as the user knows it, for display only. */
      table.string('name', 255).notNullable()

      table.string('mimeType', 128).notNullable()

      table.integer('size').unsigned().notNullable()

      /**
       * Where the bytes live on disk, relative to the storage root. The
       * name is generated rather than taken from the client, so an upload
       * cannot choose its own path or collide with another file.
       */
      table.string('path', 255).notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['conversation_id'])
      table.index(['message_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
