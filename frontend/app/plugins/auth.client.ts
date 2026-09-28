/**
 * Restores the persisted bearer token on the client before the app
 * renders, so a refresh keeps the session.
 */
export default defineNuxtPlugin(() => {
  const { restoreToken } = useToken()
  restoreToken()
})
