/**
 * Unauthenticated liveness probe. Intentionally not wrapped by the
 * "data" serializer so it can be consumed by uptime checks.
 */
export default class HealthController {
  async show() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
