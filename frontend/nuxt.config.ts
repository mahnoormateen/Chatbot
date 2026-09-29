import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  /**
   * Serves a not-found page for any URL that matches nothing else.
   *
   * The route is registered here rather than with a conventional
   * "app/pages/[...slug].vue" file. Nuxt's page scanner skips a file
   * whose name contains glob characters, so a bracketed catch-all file
   * is never picked up on Windows and the route silently does not
   * exist. Declaring the path explicitly behaves the same on every
   * platform and keeps the rule in one visible place.
   *
   * Without it vue-router cannot resolve an unknown path and logs a
   * "No match found for location" warning on the server for every
   * request that misses, which buries real routing errors.
   *
   * The response is a normal 200 rather than a 404 status. Marking the
   * status from inside the page makes Nuxt switch to its error renderer
   * and drop the body, which would leave a blank response again. A 200
   * carrying this screen is also what a single page app normally
   * returns for any path, because the client decides what to show.
   */
  modules: [
    /**
     * Every component, composable and design token in the app comes from
     * this module: it registers the U* components, pulls in Tailwind CSS
     * v4 and the colour mode module, and generates the per component
     * theme files that the components import from "#build/ui/*".
     */
    '@nuxt/ui',

    function catchAllPage(_options, nuxt) {
      nuxt.hook('pages:extend', (pages) => {
        pages.push({
          name: 'catch-all',
          // The shape Nuxt itself uses for a catch-all, seen in its
          // route-rule handling. The Nuxt 3 "?:pathMatch(.*)*" spelling
          // is rejected by vue-router 4 and registers nothing at all.
          path: '/:pathMatch(.*)',
          // The file name says nothing about the route, so the page is
          // used as given rather than being re-derived from its name.
          _sync: true,
          file: fileURLToPath(
            new URL('./app/components/CatchAllPage.vue', import.meta.url)
          ),
        })
      })
    },
  ],

  /**
   * The single stylesheet entry. It imports Tailwind and the Nuxt UI
   * theme layer, so nothing else in the app has to load CSS itself, and
   * then adds the few rules that cannot be expressed as a utility class:
   * the markdown surface and the syntax highlighting palette.
   */
  css: ['~/assets/css/main.css'],

  /**
   * Supplied by @nuxt/ui, listed here to be explicit. "system" follows
   * the operating system and "dark" is the palette used until the
   * preference has been read, which keeps a light preferring machine
   * from flashing the dark background on the first paint.
   */
  colorMode: {
    preference: 'system',
    fallback: 'dark',
  },

  /**
   * Preferred port for the dev server, matching the backend's CORS
   * allow-list. Note that Nuxt still moves to the next free port when this
   * one is busy, so config/cors.ts on the backend tolerates any localhost
   * port in development rather than a single hard coded origin.
   */
  devServer: {
    port: 3000,
  },

  /**
   * Only the base URL of the AdonisJS API is exposed to the browser.
   *
   * The Gemini API key deliberately does NOT live here and must never be
   * added: it is read exclusively by the backend from its own .env and is
   * never sent to the client. Anything under "public" is embedded into the
   * client bundle and is readable by anyone using the app.
   */
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3333',
    },
  },

  app: {
    head: {
      title: 'Gemini Chat',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Chat with the Gemini API through an AdonisJS backend.' },
      ],
    },
  },
})
