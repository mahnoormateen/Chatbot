import type { HttpContext } from '@adonisjs/core/http'
import GeminiService from '#services/gemini_service'
import GeminiModelTransformer from '#transformers/gemini_model_transformer'
import GeminiModelTierTransformer from '#transformers/gemini_model_tier_transformer'

/**
 * Exposes the Gemini models available to the configured API key, which
 * powers the model picker in the UI.
 */
export default class ModelsController {
  async index({ serialize, containerResolver }: HttpContext) {
    const gemini = await containerResolver.make(GeminiService)
    const models = await gemini.listModels()

    return serialize(GeminiModelTransformer.transform(models))
  }

  /**
   * The same models, grouped into the named tiers, so a client can offer
   * "fast" or "cheap" without knowing which model that is today. Each
   * tier carries the model it resolved to, because a tier key is a
   * preference and not a promise that a particular model is callable.
   */
  async tiers({ serialize, containerResolver }: HttpContext) {
    const gemini = await containerResolver.make(GeminiService)
    const tiers = await gemini.listTiers()

    return serialize(GeminiModelTierTransformer.transform(tiers))
  }
}
