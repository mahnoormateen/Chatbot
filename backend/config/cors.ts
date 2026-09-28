import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'

/**
 * Comma separated list of origins from the CORS_ORIGIN variable. When it
 * is not set we allow every origin in development and nothing in
 * production.
 */
const configuredOrigins = (() => {
  const value = env.get('CORS_ORIGIN')
  if (!value) return []

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
})()

/**
 * Matches a loopback origin on any port.
 *
 * The Nuxt dev server moves to the next free port whenever 3000 is busy.
 * A fixed allow-list would then reject the real origin and every request
 * would fail in the browser as a CORS error, even though the app itself
 * looked perfectly healthy. Accepting any localhost port in development
 * removes that trap.
 */
function isLoopback(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:'
    )
  } catch {
    return false
  }
}

/**
 * Origins are resolved per request: the configured list always wins, and
 * in development any other loopback origin is tolerated as well.
 */
const originResolver = (origin: string) => {
  if (configuredOrigins.includes(origin)) return true
  if (app.inDev && isLoopback(origin)) return true

  return configuredOrigins.length > 0 ? false : app.inDev
}

const allowedOrigins =
  configuredOrigins.length > 0 && !app.inDev ? configuredOrigins : originResolver

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * Allowed origins. Defaults to every origin in development and an
   * empty allowlist (no cross-origin access) in production.
   */
  origin: allowedOrigins,

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   */
  exposeHeaders: [],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds.
   */
  maxAge: 90,
})

export default corsConfig
