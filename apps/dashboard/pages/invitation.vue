<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Accept invitation' })
const route = useRoute()
const displayName = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const complete = ref(false)

async function submit(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/invitations/accept', {
      method: 'POST',
      body: { token: route.query.token, displayName: displayName.value, password: password.value }
    })
    complete.value = true
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'This invitation is invalid or has expired.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <div>
      <h1>Join SiteCare</h1>
      <p>Finish creating your account. Your invitation determines your role and site access.</p>
    </div>
    <template v-if="!complete">
      <AppInput v-model="displayName" label="Your name" name="displayName" autocomplete="name" required />
      <AppInput v-model="password" label="Password" name="password" type="password" autocomplete="new-password" description="At least 12 characters." required minlength="12" />
      <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>
      <AppButton type="submit" :loading="loading">Accept invitation</AppButton>
    </template>
    <AppButton v-else to="/login">Account ready — sign in</AppButton>
  </form>
</template>

<style scoped>
.auth-form { display: grid; gap: var(--space-5); }
.auth-form p { color: var(--color-text-muted); }
.auth-form__error { color: var(--color-danger) !important; }
</style>
