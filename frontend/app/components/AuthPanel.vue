<script setup lang="ts">
/**
 * Sign in / sign up form. Emits "authenticated" once the backend has
 * issued a token so the parent can load the transcript.
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
  <div class="auth">
    <UCard class="card">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h1>{{ isRegister ? 'Create an account' : 'Welcome back' }}</h1>
            <p>
              {{
                isRegister
                  ? 'Pick a name and a password to start chatting.'
                  : 'Sign in to reach your conversations.'
              }}
            </p>
          </div>
          <ThemeToggle />
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

          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput
              v-model="password"
              type="password"
              required
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              placeholder="At least 8 characters"
              class="w-full"
            />
          </UFormField>

          <UFormField v-if="isRegister" label="Confirm password" name="passwordConfirmation">
            <UInput
              v-model="passwordConfirmation"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Repeat your password"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            block
            :loading="loading"
            :label="isRegister ? 'Create account' : 'Sign in'"
          />
        </div>
      </UForm>

      <template #footer>
        <p class="switch">
          {{ isRegister ? 'Already have an account?' : 'No account yet?' }}
          <UButton color="primary" variant="link" @click="toggle">
            {{ isRegister ? 'Sign in' : 'Register' }}
          </UButton>
        </p>
      </template>
    </UCard>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 400px;
}

h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 650;
}

header p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 14px;
}

.switch {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  font-size: 14px;
  color: var(--ui-text-muted);
}
</style>