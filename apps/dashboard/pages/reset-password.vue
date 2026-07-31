<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Choose a new password' })
const route = useRoute()
const password = ref('')
const confirmed = ref('')
const loading = ref(false)
const error = ref('')
const complete = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  if (password.value !== confirmed.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/password-reset/complete', {
      method: 'POST',
      body: { token: route.query.token, password: password.value }
    })
    complete.value = true
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'This reset link is invalid or has expired.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <div>
      <h1>Choose a new password</h1>
      <p>Use at least 12 characters. Completing the reset signs out every existing session.</p>
    </div>
    <template v-if="!complete">
      <AppInput v-model="password" label="New password" name="password" type="password" autocomplete="new-password" required minlength="12" />
      <AppInput v-model="confirmed" label="Confirm password" name="confirmed" type="password" autocomplete="new-password" required minlength="12" />
      <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>
      <AppButton type="submit" :loading="loading">Reset password</AppButton>
    </template>
    <template v-else>
      <p role="status">Your password has been updated. You can sign in now.</p>
      <AppButton to="/login">Sign in</AppButton>
    </template>
  </form>
</template>

<style scoped>
.auth-form { display: grid; gap: var(--space-5); }
.auth-form p { color: var(--color-text-muted); }
.auth-form__error { color: var(--color-danger) !important; }
</style>
