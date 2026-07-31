<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Sign in' })

const route = useRoute()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value }
    })
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
    await navigateTo(redirect)
  } catch {
    error.value = 'The email or password is incorrect, or sign-in is temporarily unavailable.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <div>
      <p class="auth-form__eyebrow">Operations Dashboard</p>
      <h1>Welcome back</h1>
      <p>Sign in with your SiteCare email and password.</p>
    </div>
    <AppInput v-model="email" label="Email address" name="email" type="email" autocomplete="email" required />
    <AppInput v-model="password" label="Password" name="password" type="password" autocomplete="current-password" required />
    <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>
    <AppButton type="submit" :loading="loading">Sign in</AppButton>
    <NuxtLink to="/forgot-password">Forgot your password?</NuxtLink>
  </form>
</template>

<style scoped>
.auth-form { display: grid; gap: var(--space-5); }
.auth-form p { color: var(--color-text-muted); }
.auth-form__eyebrow { margin-bottom: var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.auth-form__error { color: var(--color-danger) !important; }
</style>
