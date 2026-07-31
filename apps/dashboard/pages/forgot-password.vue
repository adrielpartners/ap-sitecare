<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Reset password' })
const email = ref('')
const sent = ref(false)
const loading = ref(false)

async function submit(): Promise<void> {
  loading.value = true
  await $fetch('/api/auth/password-reset/request', { method: 'POST', body: { email: email.value } })
  sent.value = true
  loading.value = false
}
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <div>
      <h1>Reset your password</h1>
      <p>Enter your email. If it matches an active account, we’ll send a one-hour reset link.</p>
    </div>
    <template v-if="!sent">
      <AppInput v-model="email" label="Email address" name="email" type="email" autocomplete="email" required />
      <AppButton type="submit" :loading="loading">Send reset link</AppButton>
    </template>
    <p v-else role="status">If an active account matches that email, a reset link has been queued.</p>
    <NuxtLink to="/login">Return to sign in</NuxtLink>
  </form>
</template>

<style scoped>
.auth-form { display: grid; gap: var(--space-5); }
.auth-form p { color: var(--color-text-muted); }
</style>
