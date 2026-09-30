import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The attachments table was originally created with a literal "mimeType"
 * column (mixed case identifier), while Lucid models map the "mimeType"
 * property to a snake_cased "mime_type" column. Every insert against the
 * model therefore failed. Rename the column so the model and the table
 * agree; Postgres identifiers are case sensitive, so the quotes are
 * required for the original name to match.
 */
export default class extends BaseSchema {
  protected tableName = 'attachments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('mimeType', 'mime_type')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('mime_type', 'mimeType')
    })
  }
}
