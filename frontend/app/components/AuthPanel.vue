<script setup lang="ts">
/**
 * Sign in / sign up form.
 *
 * Stands alone when there is no session, so it owns its own centring and
 * needs no layout around it. Register asks for a name and a confirmation
 * because the backend validates both.
 *
 * Emits "authenticated" once the backend has issued a token; the page
 * reacts to the session becoming valid, so nothing else is wired here.
 */
const emit = defineEmits<{ authenticated: [] }>()

const { login, register, loading, error, clear } = useAuth()

const mode = ref<'login' | 'register'>('login')
const fullName = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')

const isRegister = computed(() => mode.value === 'register')

async function submit() {
  const ok = isRegister.value
    ? await register({
        fullName: fullName.value,
        email: email.value,
        password: password.value,
        passwordConfirmation: passwordConfirmation.value,
      })
    : await login(email.value, password.value)

  if (ok) emit('authenticated')
}

function toggle() {
  clear()
  mode.value = isRegister.value ? 'login' : 'register'
}
</script>

<template>
  <!--
    The glow is on the wrapper rather than the card so it reads as light
    falling on the page, not as part of the card's own surface.
  -->
  <div class="app-canvas grid min-h-svh place-items-center px-6 py-10">
    <UCard class="w-full max-w-sm shadow-xl ring-1 ring-default/70 backdrop-blur-sm">
      <template #header>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h1 class="text-lg font-semibold text-highlighted">
              {{ isRegister ? 'Create an account' : 'Welcome back' }}
            </h1>
            <p class="mt-1 text-sm text-muted">
              {{
                isRegister
                  ? 'Pick a name and a password to start chatting.'
                  : 'Sign in to reach your conversations.'
              }}
            </p>
          </div>

          <UColorModeButton />
        </div>
      </template>

      <ErrorBanner v-if="error" :error="error" class="mb-4" @dismiss="clear" />

      <UForm :state="{ fullName, email, password, passwordConfirmation }" @submit="submit">
        <div class="flex flex-col gap-4">
          <UFormField v-if="isRegister" label="Full name" name="fullName">
            <UInput
              v-model="fullName"
              type="text"
              autocomplete="name"
              placeholder="Ada Lovelace"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Email" name="email" required>
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput
              v-model="password"
              type="password"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              placeholder="At least 8 characters"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="isRegister"
            label="Confirm password"
            name="passwordConfirmation"
            required
          >
            <UInput
              v-model="passwordConfirmation"
              type="password"
              autocomplete="new-password"
              placeholder="Repeat your password"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            block
            class="cursor-pointer shadow-sm"
            :loading="loading"
            :label="isRegister ? 'Create account' : 'Sign in'"
          />
        </div>
      </UForm>

      <template #footer>
        <div class="flex items-center justify-center gap-1 text-sm text-muted">
          <span>{{ isRegister ? 'Already have an account?' : 'No account yet?' }}</span>
          <UButton color="primary" variant="link" size="sm" @click="toggle">
            {{ isRegister ? 'Sign in' : 'Register' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
