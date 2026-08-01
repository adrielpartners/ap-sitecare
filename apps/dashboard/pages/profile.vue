<script setup lang="ts">
useHead({ title: 'Profile and sessions' })
const api = useSiteCareApi()
const { data: session, refresh: refreshSession } = await useFetch('/api/session')
const { data: response, refresh } = await useFetch('/api/profile/sessions')
const { data: trustedResponse, refresh: refreshTrusted } = await useFetch('/api/profile/trusted-devices')
const sessions = computed(() => response.value?.data ?? [])
const trustedDevices = computed(() => trustedResponse.value?.data ?? [])
const busy = ref('')
const enrollment = ref<{ challengeToken: string, destinationHint: string, expiresAt: string } | null>(null)
const verificationCode = ref('')
const recoveryCodes = ref<string[]>([])
const mfaError = ref('')

async function beginMfa(): Promise<void> {
  busy.value = 'mfa-enroll'
  mfaError.value = ''
  try {
    const response = await api<{ data: { challengeToken: string, destinationHint: string, expiresAt: string } }>('/api/profile/mfa/enroll', { method: 'POST' })
    enrollment.value = response.data
  } catch (error) {
    mfaError.value = error instanceof Error ? error.message : 'MFA enrollment could not be started.'
  } finally { busy.value = '' }
}

async function verifyMfa(): Promise<void> {
  busy.value = 'mfa-verify'
  mfaError.value = ''
  try {
    const response = await api<{ data: { recoveryCodes: string[] } }>('/api/profile/mfa/verify', {
      method: 'POST',
      body: { challengeToken: enrollment.value?.challengeToken, code: verificationCode.value, rememberDevice: true }
    })
    recoveryCodes.value = response.data.recoveryCodes
    enrollment.value = null
    verificationCode.value = ''
    await refreshSession()
    await refreshTrusted()
  } catch (error) {
    mfaError.value = error instanceof Error ? error.message : 'MFA verification failed.'
  } finally { busy.value = '' }
}

async function revokeTrusted(id: string): Promise<void> {
  busy.value = `trusted-${id}`
  await api(`/api/profile/trusted-devices/${id}`, { method: 'DELETE' })
  await refreshTrusted()
  busy.value = ''
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
            <p class="text-meta">Email verification protects sign-in and high-risk operations.</p>
          </AppCard>
        </div>
        <div v-if="!session?.user.mfaEnrolled" class="mfa-enrollment">
          <div v-if="!enrollment" class="mfa-enrollment__action">
            <AppButton :loading="busy === 'mfa-enroll'" @click="beginMfa">Set up email MFA</AppButton>
          </div>
          <AppCard v-else muted>
            <div class="mfa-verification">
              <div class="mfa-verification__header">
                <h3>Check your email</h3>
                <p class="text-meta">We sent a six-digit verification code to {{ enrollment.destinationHint }}. It expires at {{ formatSiteCareDateTime(enrollment.expiresAt) }}.</p>
              </div>
              <div class="mfa-verification__field">
                <AppInput
                  v-model="verificationCode"
                  label="Verification code"
                  name="mfa-verification-code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                />
              </div>
              <div class="mfa-verification__actions">
                <AppButton :loading="busy === 'mfa-verify'" @click="verifyMfa">Verify email and enable MFA</AppButton>
              </div>
            </div>
          </AppCard>
          <p v-if="mfaError" class="text-danger" role="alert">{{ mfaError }}</p>
        </div>
        <AppCard v-if="recoveryCodes.length" tone="warning" class="section-gap">
          <h3>Save these one-time recovery codes</h3>
          <p class="text-meta">They are shown once. Store them in your password manager.</p>
          <pre>{{ recoveryCodes.join('\n') }}</pre>
        </AppCard>
      </AppPanel>
      <AppPanel title="Remembered devices" description="Remembered devices can skip email verification for 30 days. Password sign-in is still required after logout.">
        <div class="stack">
          <AppCard v-for="item in trustedDevices" :key="item.id" muted>
            <div class="cluster cluster--between">
              <div>
                <strong>Remembered browser</strong>
                <p class="text-meta">{{ item.userAgent || 'Unknown browser' }}</p>
                <p class="text-meta">Expires {{ formatSiteCareDateTime(item.expiresAt) }}</p>
              </div>
              <AppButton variant="secondary" :loading="busy === `trusted-${item.id}`" @click="revokeTrusted(item.id)">Forget</AppButton>
            </div>
          </AppCard>
          <AppEmptyState v-if="!trustedDevices.length" title="No remembered devices" description="A device can be remembered after email verification." />
        </div>
      </AppPanel>
      <AppPanel title="Active sessions" description="Sessions end after 72 hours without activity and can be revoked immediately.">
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

<style scoped>
.mfa-enrollment {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.mfa-enrollment__action,
.mfa-verification__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.mfa-verification {
  display: grid;
  gap: var(--space-5);
}

.mfa-verification__header {
  display: grid;
  gap: var(--space-2);
}

.mfa-verification__header h3,
.mfa-verification__header p {
  margin-bottom: var(--space-0);
}

.mfa-verification__field {
  max-width: 28rem;
}
</style>
