import { BaseTransformer } from '@adonisjs/core/transformers'
import type { SelectableModel } from '#services/gemini_service'

/**
 * Passing an array of models to a transformer produces a "collection"
 * resource, which the serializer wraps under "data" like every other
 * list endpoint.
 *
 * "status" is additive, so an older client that only reads the model
 * fields keeps working and simply ignores it.
 */
export default class GeminiModelTransformer extends BaseTransformer<SelectableModel> {
  toObject() {
    const model = this.resource

    return {
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      inputTokenLimit: model.inputTokenLimit,
      outputTokenLimit: model.outputTokenLimit,
      status: model.status,
    }
  }
}
