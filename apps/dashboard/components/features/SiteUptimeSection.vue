<script setup lang="ts">
const props = defineProps<{ siteId: string, isAdmin?: boolean }>()
const api = useSiteCareApi()
const { data: response, refresh } = await useFetch<any>(() => `/api/sites/${props.siteId}/cloudflare`)
const detail = computed(() => response.value?.data)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const startsAt = ref('')
const endsAt = ref('')
const maintenanceReason = ref('')
const recoveryNotes = ref('')
const restoredBackupReference = ref('')
const editableIncident = computed(() => detail.value?.incidents?.find((incident: any) => incident.status === 'recovered') ?? null)
const notificationReadiness = computed(() => detail.value?.connection?.capabilities?.notifications ?? {})
const webhookReady = computed(() => Boolean(
  notificationReadiness.value.webhookSecretConfigured
  && notificationReadiness.value.webhookDestinationConfigured
  && notificationReadiness.value.notificationPolicyConfigured
))

watch(editableIncident, (incident: any) => {
  recoveryNotes.value = incident?.recoveryNotes ?? ''
  restoredBackupReference.value = incident?.restoredBackupReference ?? ''
}, { immediate: true })

async function run(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The uptime action could not be completed.'
  } finally {
    busy.value = false
  }
}

async function provision() {
  await run(async () => {
    await api(`/api/admin/sites/${props.siteId}/cloudflare/provision`, { method: 'POST' })
    notice.value = 'Cloudflare Health Check provisioned and reconciliation enabled.'
  })
}

async function createMaintenance() {
  await run(async () => {
    await api(`/api/sites/${props.siteId}/cloudflare/maintenance`, {
      method: 'POST', body: { startsAt: startsAt.value, endsAt: endsAt.value, reason: maintenanceReason.value }
    })
    startsAt.value = ''
    endsAt.value = ''
    maintenanceReason.value = ''
    notice.value = 'Maintenance window recorded.'
  })
}

async function cancelMaintenance(id: string) {
  await run(async () => {
    await api(`/api/sites/${props.siteId}/cloudflare/maintenance/${id}`, { method: 'DELETE' })
    notice.value = 'Maintenance window cancelled.'
  })
}

async function saveRecovery(sendReport: boolean) {
  if (!editableIncident.value) return
  await run(async () => {
    await api(`/api/sites/${props.siteId}/cloudflare/incidents/${editableIncident.value.id}`, {
      method: 'PATCH', body: {
        recoveryNotes: recoveryNotes.value,
        restoredBackupReference: restoredBackupReference.value,
        sendReport
      }
    })
    notice.value = sendReport ? 'Recovery details saved and the updated report queued.' : 'Recovery details saved.'
  })
}

function tone(status?: string) {
  if (status === 'healthy') return 'success'
  if (status === 'incident' || status === 'provider-error') return 'danger'
  if (status === 'first-failure' || status === 'maintenance') return 'warning'
  return 'neutral'
}

function duration(seconds: number | null) {
  if (seconds == null) return 'Ongoing'
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}
</script>

<template>
  <div class="stack">
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

    <AppPanel title="Cloudflare uptime monitoring" description="Cloudflare probes the homepage. SiteCare records incidents and sends Dashboard email after the configured failure threshold.">
      <div class="grid">
        <AppCard muted>
          <div class="stack stack--sm">
            <AppBadge :tone="tone(detail?.monitor?.status)">{{ detail?.monitor?.status ?? 'Not configured' }}</AppBadge>
            <h2>Monitor state</h2>
            <p class="text-meta">{{ detail?.connection?.healthCheckStatus ? `Cloudflare reports ${detail.connection.healthCheckStatus}.` : 'No Cloudflare Health Check is mapped.' }}</p>
          </div>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Normal interval</p>
          <h2>{{ detail?.connection ? `${detail.connection.normalIntervalSeconds / 60} minutes` : '—' }}</h2>
          <span class="text-meta">Failure interval: 60 seconds</span>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Alert threshold</p>
          <h2>{{ detail?.connection?.alertFailureThreshold ?? 2 }} failures</h2>
          <span class="text-meta">The first failure is logged without email.</span>
        </AppCard>
      </div>
      <div class="cluster">
        <AppButton v-if="isAdmin" :loading="busy" @click="provision">Provision or repair Health Check</AppButton>
        <AppButton :loading="busy" variant="secondary" @click="refresh">Refresh Dashboard state</AppButton>
      </div>
      <p class="text-meta">
        Cloudflare notifications:
        <strong>{{ webhookReady ? 'Ready' : 'Setup required' }}</strong>.
        A webhook secret, destination, and enabled Health Check notification policy must all be configured.
      </p>
    </AppPanel>

    <AppPanel title="Downtime incidents" description="Confirmed incidents remain as long-term summaries; raw check history rolls off after 60 days.">
      <AppTable v-if="detail?.incidents?.length" caption="Cloudflare uptime incidents" :columns="['Status', 'Started', 'Recovered', 'Duration', 'Failures', 'Reason']">
        <tr v-for="incident in detail.incidents" :key="incident.id">
          <td><AppBadge :tone="incident.status === 'recovered' ? 'success' : 'danger'">{{ incident.status }}</AppBadge></td>
          <td>{{ formatSiteCareDateTime(incident.startedAt) }}</td>
          <td>{{ incident.recoveredAt ? formatSiteCareDateTime(incident.recoveredAt) : 'Ongoing' }}</td>
          <td>{{ duration(incident.durationSeconds) }}</td>
          <td>{{ incident.failureCount }}</td>
          <td>{{ incident.finalReason ?? 'No provider reason' }}</td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No downtime incidents" description="An incident is created only after the configured number of consecutive Cloudflare failures." />
    </AppPanel>

    <AppPanel v-if="editableIncident" title="Latest recovery report" description="Add technician notes and any restored backup reference, then send an updated report to this site's uptime recipients.">
      <div class="stack">
        <AppTextarea v-model="recoveryNotes" label="Successful recovery notes" name="recovery-notes" />
        <AppInput v-model="restoredBackupReference" label="Restored backup reference" name="restored-backup" placeholder="Backup ID, storage path, or None" />
        <div class="cluster">
          <AppButton :loading="busy" variant="secondary" @click="saveRecovery(false)">Save notes</AppButton>
          <AppButton :loading="busy" @click="saveRecovery(true)">Save and email report</AppButton>
        </div>
      </div>
    </AppPanel>

    <AppPanel title="Maintenance windows" description="Failures inside an active window are recorded but excluded from downtime and alerts.">
      <form class="stack" @submit.prevent="createMaintenance">
        <div class="grid">
          <AppInput v-model="startsAt" label="Starts" name="maintenance-start" type="datetime-local" required />
          <AppInput v-model="endsAt" label="Ends" name="maintenance-end" type="datetime-local" required />
        </div>
        <AppInput v-model="maintenanceReason" label="Reason" name="maintenance-reason" required />
        <AppButton :loading="busy" type="submit">Add maintenance window</AppButton>
      </form>
      <AppTable v-if="detail?.maintenanceWindows?.length" caption="Maintenance windows" :columns="['Status', 'Starts', 'Ends', 'Reason', 'Action']">
        <tr v-for="window in detail.maintenanceWindows" :key="window.id">
          <td><AppBadge :tone="window.cancelledAt ? 'neutral' : 'info'">{{ window.cancelledAt ? 'Cancelled' : 'Scheduled' }}</AppBadge></td>
          <td>{{ formatSiteCareDateTime(window.startsAt) }}</td>
          <td>{{ formatSiteCareDateTime(window.endsAt) }}</td>
          <td>{{ window.reason }}</td>
          <td><AppButton v-if="!window.cancelledAt" :disabled="busy" variant="quiet" @click="cancelMaintenance(window.id)">Cancel</AppButton></td>
        </tr>
      </AppTable>
    </AppPanel>
  </div>
</template>

<style scoped>
.notice, .error { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); }
.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }
</style>
