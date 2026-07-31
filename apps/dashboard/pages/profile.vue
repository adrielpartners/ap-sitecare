<script setup lang="ts">
useHead({ title: 'Profile and sessions' })
const api = useSiteCareApi()
const { data: session } = await useFetch('/api/session')
const { data: response, refresh } = await useFetch('/api/profile/sessions')
const sessions = computed(() => response.value?.data ?? [])
const busy = ref('')

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
      </AppPanel>
      <AppPanel title="Active sessions" description="Sessions renew for 30 days while active and can be revoked immediately.">
        <div class="stack">
          <AppCard v-for="item in sessions" :key="item.id" muted>
            <div class="cluster cluster--between">
              <div>
                <strong>{{ item.current ? 'This browser' : 'Signed-in browser' }}</strong>
                <p class="text-meta">{{ item.userAgent || 'Unknown browser' }}</p>
                <p class="text-meta">Last used {{ new Date(item.lastSeenAt).toLocaleString() }}</p>
              </div>
              <AppButton variant="secondary" :loading="busy === item.id" @click="revoke(item.id)">Revoke</AppButton>
            </div>
          </AppCard>
        </div>
      </AppPanel>
    </div>
  </div>
</template>
