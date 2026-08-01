<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Sign in' })

const route = useRoute()
const email = ref('')
const password = ref('')
const verificationCode = ref('')
const challenge = ref<{ challengeToken: string, destinationHint: string, expiresAt: string } | null>(null)
const rememberDevice = ref(true)
const loading = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  error.value = ''
  loading.value = true
  try {
    if (!challenge.value) {
      const response = await $fetch<{
        status: 'authenticated' | 'mfa-required'
        data?: { challengeToken: string, destinationHint: string, expiresAt: string }
      }>('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
      if (response.status === 'mfa-required' && response.data) {
        challenge.value = response.data
        return
      }
    } else {
      await $fetch('/api/auth/mfa/verify', {
        method: 'POST',
        body: {
          challengeToken: challenge.value.challengeToken,
          code: verificationCode.value,
          rememberDevice: rememberDevice.value
        }
      })
    }
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
    await navigateTo(redirect)
  } catch {
    error.value = challenge.value
      ? 'The verification code is invalid or expired. Return to sign in to request a new code.'
      : 'The email or password is incorrect, or sign-in is temporarily unavailable.'
  } finally {
    loading.value = false
  }
}

function restart(): void {
  challenge.value = null
  verificationCode.value = ''
  error.value = ''
}
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <div>
      <p class="auth-form__eyebrow">Operations Dashboard</p>
      <h1>Welcome back</h1>
      <p v-if="!challenge">Sign in with your SiteCare email and password.</p>
      <p v-else>Enter the code sent to {{ challenge.destinationHint }}.</p>
    </div>
    <template v-if="!challenge">
      <AppInput v-model="email" label="Email address" name="email" type="email" autocomplete="email" required />
      <AppInput v-model="password" label="Password" name="password" type="password" autocomplete="current-password" required />
    </template>
    <template v-else>
      <AppInput v-model="verificationCode" label="Email verification or recovery code" name="verification-code" autocomplete="one-time-code" maxlength="32" required />
      <label class="remember-device"><input v-model="rememberDevice" type="checkbox"> <span>Remember this device for 30 days</span></label>
      <p class="text-meta">The code expires at {{ formatSiteCareDateTime(challenge.expiresAt) }}.</p>
    </template>
    <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>
    <AppButton type="submit" :loading="loading">{{ challenge ? 'Verify and sign in' : 'Sign in' }}</AppButton>
    <button v-if="challenge" class="link-button" type="button" @click="restart">Return to sign in</button>
    <NuxtLink v-else to="/forgot-password">Forgot your password?</NuxtLink>
  </form>
</template>

<style scoped>
.auth-form { display: grid; gap: var(--space-5); }
.auth-form p { color: var(--color-text-muted); }
.auth-form__eyebrow { margin-bottom: var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.auth-form__error { color: var(--color-danger) !important; }
.remember-device { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text); }
.link-button { border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; text-align: left; padding: 0; }
</style>
