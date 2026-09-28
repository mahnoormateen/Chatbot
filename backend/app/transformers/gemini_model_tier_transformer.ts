import { BaseTransformer } from '@adonisjs/core/transformers'
import type { GeminiModelTier } from '#services/gemini_service'
import GeminiModelTransformer from '#transformers/gemini_model_transformer'

/**
 * Serializes a tier with the model it resolved to.
 *
 * The nested model goes through the model transformer so a tier and a
 * model are the same shape wherever a client meets them, and the tier key
 * and flags stay additive next to it rather than reshaping the model.
 */
export default class GeminiModelTierTransformer extends BaseTransformer<GeminiModelTier> {
  toObject() {
    const tier = this.resource

    return {
      key: tier.key,
      title: tier.title,
      note: tier.note,
      exact: tier.exact,
      model: GeminiModelTransformer.transform(tier.model),
    }
  }
}
