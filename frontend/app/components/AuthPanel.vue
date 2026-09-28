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
    <form class="card" @submit.prevent="submit">
      <header>
        <h1>{{ isRegister ? 'Create an account' : 'Welcome back' }}</h1>
        <p>
          {{
            isRegister
              ? 'Pick a name and a password to start chatting.'
              : 'Sign in to reach your conversations.'
          }}
        </p>
      </header>

      <ErrorBanner v-if="error" :error="error" class="auth-error" @dismiss="clear" />

      <div v-if="isRegister" class="field">
        <label for="fullName">Full name</label>
        <input id="fullName" v-model="fullName" type="text" autocomplete="name" placeholder="Ada Lovelace" />
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" placeholder="you@example.com" />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          placeholder="At least 8 characters"
        />
      </div>

      <div v-if="isRegister" class="field">
        <label for="passwordConfirmation">Confirm password</label>
        <input
          id="passwordConfirmation"
          v-model="passwordConfirmation"
          type="password"
          required
          autocomplete="new-password"
          placeholder="Repeat your password"
        />
      </div>

      <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
        <span v-if="loading" class="spinner" aria-hidden="true" />
        {{ isRegister ? 'Create account' : 'Sign in' }}
      </button>

      <p class="switch">
        {{ isRegister ? 'Already have an account?' : 'No account yet?' }}
        <button class="btn-ghost" type="button" @click="toggle">
          {{ isRegister ? 'Sign in' : 'Register' }}
        </button>
      </p>
    </form>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-error {
  margin-bottom: 14px;
}

.card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 650;
}

header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.switch {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  font-size: 14px;
  color: var(--text-muted);
}
</style>
