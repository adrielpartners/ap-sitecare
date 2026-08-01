<script setup lang="ts">
useHead({ title: 'Profile and sessions' })
const api = useSiteCareApi()
const { data: session, refresh: refreshSession } = await useFetch('/api/session')
const { data: response, refresh } = await useFetch('/api/profile/sessions')
const sessions = computed(() => response.value?.data ?? [])
const busy = ref('')
const enrollment = ref<{ secret: string, otpauthUri: string } | null>(null)
const verificationCode = ref('')
const recoveryCodes = ref<string[]>([])
const mfaError = ref('')

async function beginMfa(): Promise<void> {
  busy.value = 'mfa-enroll'
  mfaError.value = ''
  try {
    const response = await api<{ data: { secret: string, otpauthUri: string } }>('/api/profile/mfa/enroll', { method: 'POST' })
    enrollment.value = response.data
  } catch (error) {
    mfaError.value = error instanceof Error ? error.message : 'MFA enrollment could not be started.'
  } finally { busy.value = '' }
}

async function verifyMfa(): Promise<void> {
  busy.value = 'mfa-verify'
  mfaError.value = ''
  try {
    const response = await api<{ data: { recoveryCodes: string[] } }>('/api/profile/mfa/verify', { method: 'POST', body: { code: verificationCode.value } })
    recoveryCodes.value = response.data.recoveryCodes
    enrollment.value = null
    verificationCode.value = ''
    await refreshSession()
  } catch (error) {
    mfaError.value = error instanceof Error ? error.message : 'MFA verification failed.'
  } finally { busy.value = '' }
}

async function revoke(id: string): Promise<void> {
  busy.value = id
  await api(`/api/profile/sessions/${id}`, { method: 'DELETE' })
  await refresh()
  if (session.value?.session.id === id) await navigateTo('/login')
  busy.value = ''
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Account security</p>
      <h1>Profile and sessions</h1>
      <p>Review your account role and revoke browsers you no longer use.</p>
    </header>
    <div class="stack">
      <AppPanel title="Profile">
        <div class="grid">
          <AppCard muted><strong>{{ session?.user.displayName }}</strong><p class="text-meta">{{ session?.user.email }}</p></AppCard>
          <AppCard muted><strong>{{ session?.user.role }}</strong><p class="text-meta">Application role</p></AppCard>
          <AppCard :tone="session?.user.mfaEnrolled ? 'success' : 'warning'">
            <strong>{{ session?.user.mfaEnrolled ? 'MFA enrolled' : 'MFA not enrolled' }}</strong>
            <p class="text-meta">MFA enrollment is prepared; enforcement precedes high-risk update and restore execution.</p>
          </AppCard>
        </div>
        <div v-if="!session?.user.mfaEnrolled" class="stack section-gap">
          <AppButton v-if="!enrollment" :loading="busy === 'mfa-enroll'" @click="beginMfa">Set up authenticator</AppButton>
          <AppCard v-else muted>
            <h3>Connect your authenticator</h3>
            <p class="text-meta">Add this TOTP secret to 1Password, Authy, Google Authenticator, or another authenticator. Then enter its six-digit code.</p>
            <p><code>{{ enrollment.secret }}</code></p>
            <label class="field"><span>Verification code</span><input v-model="verificationCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
            <AppButton :loading="busy === 'mfa-verify'" @click="verifyMfa">Verify and enable MFA</AppButton>
          </AppCard>
          <p v-if="mfaError" class="text-danger" role="alert">{{ mfaError }}</p>
        </div>
        <AppCard v-if="recoveryCodes.length" tone="warning" class="section-gap">
          <h3>Save these one-time recovery codes</h3>
          <p class="text-meta">They are shown once. Store them in your password manager.</p>
          <pre>{{ recoveryCodes.join('\n') }}</pre>
        </AppCard>
      </AppPanel>
      <AppPanel title="Active sessions" description="Sessions renew for 30 days while active and can be revoked immediately.">
        <div class="stack">
          <AppCard v-for="item in sessions" :key="item.id" muted>
            <div class="cluster cluster--between">
              <div>
                <strong>{{ item.current ? 'This browser' : 'Signed-in browser' }}</strong>
                <p class="text-meta">{{ item.userAgent || 'Unknown browser' }}</p>
                <p class="text-meta">Last used {{ formatSiteCareDateTime(item.lastSeenAt) }}</p>
              </div>
              <AppButton variant="secondary" :loading="busy === item.id" @click="revoke(item.id)">Revoke</AppButton>
            </div>
          </AppCard>
        </div>
      </AppPanel>
    </div>
  </div>
</template>
