import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'

/**
 * Controllers are referenced through the generated barrel, which holds
 * dynamic imports. The router resolves them on first use, so booting the
 * server does not pull in every controller, model and transformer.
 *
 * Liveness probe, kept outside the "/api" group and unauthenticated so
 * uptime checks do not need a token.
 */
router.get('/health', [controllers.Health, 'show']).as('health')

/**
 * Login and register are public, the remaining auth routes need a token.
 */
router
  .group(() => {
    router.post('/register', [controllers.Auth, 'register']).as('auth.register')
    router.post('/login', [controllers.Auth, 'login']).as('auth.login')

    router
      .group(() => {
        router.get('/me', [controllers.Auth, 'me']).as('auth.me')
        router.post('/logout', [controllers.Auth, 'logout']).as('auth.logout')
      })
      .use([middleware.auth()])
  })
  .prefix('/api/auth')

/**
 * Everything below requires an authenticated user. Conversations are
 * always scoped to the owner inside the controllers.
 */
router
  .group(() => {
    router.get('/models', [controllers.Models, 'index']).as('models.index')
    router.get('/model-tiers', [controllers.Models, 'tiers']).as('models.tiers')

    router
      .group(() => {
        router.get('/', [controllers.Conversations, 'index']).as('conversations.index')
        router.post('/', [controllers.Conversations, 'store']).as('conversations.store')

        router
          .group(() => {
            router.get('/', [controllers.Conversations, 'show']).as('conversations.show')
            router.patch('/', [controllers.Conversations, 'update']).as('conversations.update')
            router.delete('/', [controllers.Conversations, 'destroy']).as('conversations.destroy')
          })
          .prefix('/:id')
      })
      .prefix('/conversations')

    router
      .group(() => {
        router.get('/', [controllers.Messages, 'index']).as('conversations.messages.index')
        router.post('/', [controllers.Messages, 'store']).as('conversations.messages.store')
        router.post('/stream', [controllers.Messages, 'stream']).as('conversations.messages.stream')

        /**
         * Downloads the bytes of a stored attachment, scoped to the
         * conversation, message and owner inside the controller.
         */
        router
          .get('/:messageId/attachments/:attachmentId', [controllers.Messages, 'attachmentFile'])
          .as('conversations.messages.attachments.file')
      })
      .prefix('/conversations/:conversationId/messages')
  })
  .prefix('/api')
  .use([middleware.auth()])
