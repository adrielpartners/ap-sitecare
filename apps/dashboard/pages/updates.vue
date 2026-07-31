<script setup lang="ts">
interface PortfolioEntry {
  site: { id: string, name: string, url: string, status: 'active' | 'disabled' }
  snapshot: {
    checkedAt: string
    coreInstalledVersion: string
    coreAvailableVersion: string | null
    pendingUpdateCount: number
    pluginCount: number
    themeCount: number
  }
  latestSuccessAt: string | null
  latestFailureAt: string | null
  failureCount: number
  status: 'current' | 'pending' | 'stale'
}

const api = useSiteCareApi()
const { data: response, refresh } = await useFetch<{ ok: true, data: PortfolioEntry[] }>('/api/updates')
const { data: sessionResponse } = await useFetch<{ user: { role: string } }>('/api/session')
const entries = computed(() => response.value?.data ?? [])
const isAdmin = computed(() => sessionResponse.value?.user.role === 'admin')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

async function synchronizeHostinger() {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const result = await api<{ data: { created: boolean } }>('/api/admin/integrations/hostinger/synchronize', { method: 'POST' })
    notice.value = result.data.created ? 'Hostinger portfolio synchronization was queued.' : 'A Hostinger synchronization is already queued.'
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Hostinger synchronization could not be queued.'
  } finally {
    busy.value = false
  }
}

function statusTone(status: PortfolioEntry['status']): 'success' | 'warning' | 'danger' {
  if (status === 'current') return 'success'
  return status === 'pending' ? 'warning' : 'danger'
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">WordPress operations</p>
      <h1>Update intelligence</h1>
      <p>Review installed core, plugin, and theme versions, pending releases, and recent update failures across connected sites.</p>
    </header>

    <div class="stack">
      <div v-if="isAdmin" class="cluster">
        <AppButton :loading="busy" variant="secondary" @click="synchronizeHostinger">Sync Hostinger portfolio</AppButton>
        <span class="text-meta">WordPress inventories refresh every six hours and can also be requested per site.</span>
      </div>
      <p v-if="notice" class="updates-page__notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="updates-page__error" role="alert">{{ errorMessage }}</p>

      <AppPanel title="Managed update status" :description="`${entries.length} sites with detailed inventory`">
        <AppTable v-if="entries.length" caption="Managed WordPress update status" :columns="['Site', 'Status', 'Core', 'Inventory', 'Last check', 'Latest activity', 'Failures', '']">
          <tr v-for="entry in entries" :key="entry.site.id">
            <td><strong>{{ entry.site.name }}</strong><br><span class="text-meta">{{ entry.site.url }}</span></td>
            <td><AppBadge :tone="statusTone(entry.status)">{{ entry.status }}</AppBadge><br><span class="text-meta">{{ entry.snapshot.pendingUpdateCount }} pending</span></td>
            <td>{{ entry.snapshot.coreInstalledVersion }}<br><span class="text-meta">{{ entry.snapshot.coreAvailableVersion ? `→ ${entry.snapshot.coreAvailableVersion}` : 'Current' }}</span></td>
            <td>{{ entry.snapshot.pluginCount }} plugins<br><span class="text-meta">{{ entry.snapshot.themeCount }} themes</span></td>
            <td>{{ new Date(entry.snapshot.checkedAt).toLocaleString() }}</td>
            <td>{{ entry.latestSuccessAt ? new Date(entry.latestSuccessAt).toLocaleString() : 'No activity yet' }}</td>
            <td><AppBadge :tone="entry.failureCount ? 'danger' : 'neutral'">{{ entry.failureCount }}</AppBadge><br><span v-if="entry.latestFailureAt" class="text-meta">Latest {{ new Date(entry.latestFailureAt).toLocaleString() }}</span></td>
            <td><AppButton :to="`/sites/${entry.site.id}?tab=updates`" variant="quiet">Inspect →</AppButton></td>
          </tr>
        </AppTable>
        <AppEmptyState v-else title="No detailed inventories yet" description="Upgrade connected sites to AP SiteCare plugin 0.3, then run their first refresh." />
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.updates-page__notice,
.updates-page__error {
  margin: var(--space-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.updates-page__notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.updates-page__error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
