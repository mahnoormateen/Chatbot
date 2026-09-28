import type { ApplicationService } from '@adonisjs/core/types'
import GeminiService from '#services/gemini_service'

/**
 * Application specific provider. Registers the bindings our own
 * classes need inside the IoC container.
 */
export default class AppProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    /**
     * The Gemini client holds a connection pool, so a single instance
     * is shared for the lifetime of the process.
     */
    this.app.container.singleton(GeminiService, () => new GeminiService())
  }

  boot() {
    /**
     * Resolving the service here is what starts the model discovery its
     * constructor kicks off. The constructor returns immediately, so this
     * does not delay the boot; it only means the list of models this key
     * can use is already being confirmed while the server comes up,
     * instead of the first visitor waiting for it.
     */
    this.app.container.make(GeminiService)
  }
}
