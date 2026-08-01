<script setup lang="ts">
type ComponentType = 'core' | 'plugin' | 'theme'
type Outcome = 'succeeded' | 'failed' | 'observed'

interface UpdateSnapshot {
  checkedAt: string
  receivedAt: string
  coreInstalledVersion: string
  coreAvailableVersion: string | null
  pluginCount: number
  themeCount: number
  pendingUpdateCount: number
}

interface InventoryItem {
  componentType: ComponentType
  slug: string
  name: string
  installedVersion: string
  availableVersion: string | null
  active: boolean
  autoUpdateEnabled: boolean
  supportStatus: 'supported' | 'possibly-abandoned' | 'unknown'
  premiumLicenseStatus: 'active' | 'inactive' | 'unknown' | 'not-applicable'
}

interface UpdateActivity {
  id: string
  componentType: ComponentType
  name: string
  priorVersion: string | null
  targetVersion: string | null
  resultingVersion: string | null
  completedAt: string
  outcome: Outcome
  errorCode: string | null
  errorMessage: string | null
}

interface UpdateDetail {
  snapshot: UpdateSnapshot | null
  inventory: InventoryItem[]
  activities: UpdateActivity[]
  stale: boolean
}

interface HostingerDetail {
  availability: 'available' | 'not-found' | 'not-configured' | 'not-synchronized' | 'provider-error'
  accountUsername: string | null
  wordpressInstallationId: string | null
  websiteEnabled: boolean | null
  wordpressValid: boolean | null
  managementUrl: string | null
  dailyBackupAvailability: 'available' | 'not-available'
  latestDailyBackupAt: string | null
  dailyBackupMessage: string | null
  lastSyncedAt: string | null
  lastErrorMessage: string | null
}

const props = defineProps<{ siteId: string }>()
const api = useSiteCareApi()
const { data: updateResponse, refresh } = await useFetch<{ ok: true, data: UpdateDetail }>(
  () => `/api/sites/${props.siteId}/updates`
)
const { data: hostingerResponse } = await useFetch<{ ok: true, data: HostingerDetail }>(
  () => `/api/sites/${props.siteId}/hostinger`
)
const detail = computed(() => updateResponse.value?.data)
const hostinger = computed(() => hostingerResponse.value?.data)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

const core = computed(() => detail.value?.inventory.filter((item: InventoryItem) => item.componentType === 'core') ?? [])
const plugins = computed(() => detail.value?.inventory.filter((item: InventoryItem) => item.componentType === 'plugin') ?? [])
const themes = computed(() => detail.value?.inventory.filter((item: InventoryItem) => item.componentType === 'theme') ?? [])

async function requestRefresh() {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const response = await api<{ data: { job: { id: string }, created: boolean } }>(
      `/api/sites/${props.siteId}/updates/refresh`,
      { method: 'POST' }
    )
    notice.value = response.data.created
      ? 'A fresh WordPress inventory was queued. It will appear after the worker verifies the report.'
      : 'A refresh for this site is already queued.'
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The refresh could not be queued.'
  } finally {
    busy.value = false
  }
}

function availabilityTone(value: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (value === 'available') return 'success'
  if (value === 'provider-error') return 'danger'
  if (value === 'not-found') return 'warning'
  return 'neutral'
}

function outcomeTone(value: Outcome): 'success' | 'danger' | 'info' {
  if (value === 'failed') return 'danger'
  return value === 'succeeded' ? 'success' : 'info'
}
</script>

<template>
  <div class="stack">
    <div class="cluster cluster--between">
      <div>
        <p class="eyebrow">WordPress source of truth</p>
        <h2>Update intelligence</h2>
        <p class="text-meta">Installed software, available versions, and observed update outcomes from the connected site.</p>
      </div>
      <AppButton :loading="busy" variant="secondary" @click="requestRefresh">Refresh inventory</AppButton>
    </div>

    <p v-if="notice" class="updates-notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="updates-error" role="alert">{{ errorMessage }}</p>

    <template v-if="detail?.snapshot">
      <div class="grid">
        <AppCard muted>
          <p class="text-meta">Update check</p>
          <h2>{{ formatSiteCareDateTime(detail.snapshot.checkedAt) }}</h2>
          <AppBadge :tone="detail.stale ? 'warning' : 'success'">{{ detail.stale ? 'Stale' : 'Fresh' }}</AppBadge>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Pending updates</p>
          <h2>{{ detail.snapshot.pendingUpdateCount }}</h2>
          <AppBadge :tone="detail.snapshot.pendingUpdateCount ? 'warning' : 'success'">
            {{ detail.snapshot.pendingUpdateCount ? 'Review needed' : 'Current' }}
          </AppBadge>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Installed inventory</p>
          <h2>{{ detail.snapshot.pluginCount }} plugins · {{ detail.snapshot.themeCount }} themes</h2>
          <span class="text-meta">Received {{ formatSiteCareDateTime(detail.snapshot.receivedAt) }}</span>
        </AppCard>
      </div>

      <AppPanel title="Core, plugins, and themes" description="Current inventory from the latest completed WordPress update check.">
        <AppTable caption="WordPress update inventory" :columns="['Component', 'Installed', 'Available', 'State', 'Auto-update', 'Support / license']">
          <tr v-for="item in [...core, ...plugins, ...themes]" :key="`${item.componentType}:${item.slug}`">
            <td><strong>{{ item.name }}</strong><br><span class="text-meta">{{ item.componentType }} · {{ item.slug }}</span></td>
            <td>{{ item.installedVersion }}</td>
            <td><AppBadge :tone="item.availableVersion ? 'warning' : 'success'">{{ item.availableVersion ?? 'Current' }}</AppBadge></td>
            <td>{{ item.active ? 'Active' : 'Inactive' }}</td>
            <td>{{ item.autoUpdateEnabled ? 'Enabled' : 'Manual' }}</td>
            <td>{{ item.supportStatus }}<br><span class="text-meta">License: {{ item.premiumLicenseStatus }}</span></td>
          </tr>
        </AppTable>
      </AppPanel>

      <AppPanel title="Update activity" description="Successful, failed, and reconciled updates reported by WordPress.">
        <AppTable v-if="detail.activities.length" caption="WordPress update activity" :columns="['Completed', 'Component', 'Version change', 'Outcome', 'Details']">
          <tr v-for="activity in detail.activities" :key="activity.id">
            <td>{{ formatSiteCareDateTime(activity.completedAt) }}</td>
            <td><strong>{{ activity.name }}</strong><br><span class="text-meta">{{ activity.componentType }}</span></td>
            <td>{{ activity.priorVersion ?? 'Unknown' }} → {{ activity.resultingVersion ?? activity.targetVersion ?? 'Unknown' }}</td>
            <td><AppBadge :tone="outcomeTone(activity.outcome)">{{ activity.outcome }}</AppBadge></td>
            <td>{{ activity.errorMessage ?? 'No error reported' }}<br><span v-if="activity.errorCode" class="text-meta">{{ activity.errorCode }}</span></td>
          </tr>
        </AppTable>
        <AppEmptyState v-else title="No update activity yet" description="Version changes and failed updater results will appear as WordPress reports them." />
      </AppPanel>
    </template>
    <AppEmptyState v-else title="Detailed inventory not received" description="Upgrade the AP SiteCare plugin to version 0.3 or later, then request a refresh." />

    <AppPanel title="Hostinger visibility" description="Hosting metadata is separate from WordPress update evidence and SiteCare long-term backups.">
      <div v-if="hostinger" class="stack stack--sm">
        <div class="cluster cluster--between">
          <AppBadge :tone="availabilityTone(hostinger.availability)">{{ hostinger.availability }}</AppBadge>
          <AppButton v-if="hostinger.managementUrl" :to="hostinger.managementUrl" variant="secondary">Open Hostinger Websites ↗</AppButton>
        </div>
        <div class="grid">
          <AppCard muted><p class="text-meta">Account</p><h2>{{ hostinger.accountUsername ?? 'Not available' }}</h2></AppCard>
          <AppCard muted><p class="text-meta">Installation ID</p><h2>{{ hostinger.wordpressInstallationId ?? 'Not required' }}</h2></AppCard>
          <AppCard muted><p class="text-meta">Daily backup evidence</p><h2>{{ hostinger.latestDailyBackupAt ? formatSiteCareDateTime(hostinger.latestDailyBackupAt) : 'Not available' }}</h2></AppCard>
        </div>
        <p class="text-meta">{{ hostinger.lastErrorMessage ?? hostinger.dailyBackupMessage }}</p>
      </div>
    </AppPanel>
  </div>
</template>

<style scoped>
.updates-notice,
.updates-error {
  margin: var(--space-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.updates-notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.updates-error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
