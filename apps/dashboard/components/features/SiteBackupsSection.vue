<script setup lang="ts">
const props = defineProps<{ siteId: string }>()
const { data: response, refresh } = await useFetch(() => `/api/sites/${props.siteId}/backups`)
const overview = computed(() => response.value && 'data' in response.value ? response.value.data : null)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const enabled = ref(false)
const frequency = ref('daily')
const filesEnabled = ref(true)
const databaseEnabled = ref(true)
const storageProvider = ref('dropbox')
const keepDaily = ref('7')
const keepWeekly = ref('4')
const keepMonthly = ref('6')
const autoDeleteExpired = ref(false)
const restoreEnabled = ref(false)
const connectionType = ref('manual-unsupported')
const localPath = ref('')
const databaseConfigured = ref(false)
const databaseHost = ref('')
const databasePort = ref('3306')
const databaseName = ref('')
const databaseUsername = ref('')
const databasePassword = ref('')
const providerLabel = ref('')
const notes = ref('')
const connectionNotes = ref('')

watch(overview, (value) => {
  if (!value) return
  const policy = value.policy
  const connection = value.connection
  enabled.value = policy?.enabled ?? false
  frequency.value = policy?.frequency ?? 'daily'
  filesEnabled.value = policy?.filesEnabled ?? true
  databaseEnabled.value = policy?.databaseEnabled ?? true
  storageProvider.value = policy?.storageProvider ?? 'dropbox'
  keepDaily.value = String(policy?.retention.keepDaily ?? 7)
  keepWeekly.value = String(policy?.retention.keepWeekly ?? 4)
  keepMonthly.value = String(policy?.retention.keepMonthly ?? 6)
  autoDeleteExpired.value = policy?.retention.autoDeleteExpired ?? false
  restoreEnabled.value = policy?.restoreEnabled ?? false
  connectionType.value = connection?.connectionType ?? 'manual-unsupported'
  localPath.value = connection?.localPath ?? ''
  databaseConfigured.value = connection?.databaseConfigured ?? false
  databaseHost.value = connection?.databaseHost ?? ''
  databasePort.value = String(connection?.databasePort ?? 3306)
  databaseName.value = connection?.databaseName ?? ''
  databaseUsername.value = connection?.databaseUsername ?? ''
  databasePassword.value = ''
  providerLabel.value = connection?.providerLabel ?? ''
  notes.value = policy?.notes ?? ''
  connectionNotes.value = connection?.notes ?? ''
}, { immediate: true })

const capabilityTone = computed(() => ({
  full: 'success',
  partial: 'warning',
  'backup-only': 'info',
  unsupported: 'neutral'
}[overview.value?.connectionAssessment.restoreCapability as 'full' | 'partial' | 'backup-only' | 'unsupported' ?? 'unsupported'] as 'success' | 'warning' | 'info' | 'neutral'))

async function runAction(action: () => Promise<{ message?: string } | void>, successMessage: string) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const result = await action()
    notice.value = result?.message ?? successMessage
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The backup request could not be completed.'
  } finally {
    busy.value = false
  }
}

async function savePolicy() {
  await runAction(async () => {
    await $fetch(`/api/sites/${props.siteId}/backups/policy`, {
      method: 'PUT',
      body: {
        enabled: enabled.value,
        frequency: frequency.value,
        filesEnabled: filesEnabled.value,
        databaseEnabled: databaseEnabled.value,
        storageProvider: storageProvider.value,
        keepDaily: Number(keepDaily.value),
        keepWeekly: Number(keepWeekly.value),
        keepMonthly: Number(keepMonthly.value),
        autoDeleteExpired: autoDeleteExpired.value,
        restoreEnabled: restoreEnabled.value,
        restoreRequiresConfirmation: true,
        notes: notes.value,
        connectionType: connectionType.value,
        localPath: localPath.value,
        databaseConfigured: databaseConfigured.value,
        databaseHost: databaseHost.value,
        databasePort: Number(databasePort.value),
        databaseName: databaseName.value,
        databaseUsername: databaseUsername.value,
        databasePassword: databasePassword.value,
        providerLabel: providerLabel.value,
        connectionNotes: connectionNotes.value
      }
    })
  }, 'Backup policy saved and audited.')
}

async function testStorage() {
  await runAction(async () => {
    const result = await $fetch('/api/backup-storage/dropbox/test', { method: 'POST' })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Dropbox connection test failed.')
    return { message: result.data.message }
  }, 'Storage connection checked.')
}

async function testConnection() {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${props.siteId}/backups/connection-test`, { method: 'POST' })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Hosting connection test failed.')
    return { message: result.data.messages.join(' ') }
  }, 'Hosting connection checked.')
}

async function planBackup() {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${props.siteId}/backups/manual`, { method: 'POST' })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Manual backup planning failed.')
    return { message: result.data.message }
  }, 'Manual backup job prepared.')
}

async function verifyBackup(backupId: string) {
  await runAction(async () => {
    const result = await $fetch(`/api/backups/${backupId}/verify`, { method: 'POST' })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Backup verification failed.')
    return { message: result.data.message }
  }, 'Backup evidence checked.')
}

async function viewManifest(backupId: string) {
  await runAction(async () => {
    const result = await $fetch(`/api/backups/${backupId}/manifest`)
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Manifest could not be loaded.')
    return { message: JSON.stringify(result.data, null, 2) }
  }, 'Manifest loaded.')
}

async function retryBackup(backupId: string) {
  await runAction(async () => {
    const result = await $fetch(`/api/backups/${backupId}/retry`, { method: 'POST' })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Backup retry could not be queued.')
    return { message: result.data.message }
  }, 'Backup retry queued.')
}

async function prepareRestore(backupId: string) {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${props.siteId}/restore-plans`, { method: 'POST', body: { backupId } })
    if (!('data' in result)) throw new Error('error' in result ? result.error.message : 'Restore planning failed.')
    return { message: result.data.plan.status === 'preflight-passed'
      ? 'Restore plan prepared. Destructive execution remains unavailable.'
      : 'Restore preflight recorded with warnings.' }
  }, 'Restore plan prepared.')
}

function formatBytes(value: number | null): string {
  if (value === null) return 'Unknown'
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="stack">
    <div v-if="overview" class="grid">
      <AppCard :tone="overview.policy?.enabled ? 'success' : 'neutral'">
        <div class="stack stack--sm">
          <AppBadge :tone="overview.policy?.enabled ? 'success' : 'neutral'">{{ overview.policy?.enabled ? 'Enabled' : 'Not enabled' }}</AppBadge>
          <h3>Backup policy</h3>
          <p class="text-meta">{{ overview.policy ? `${overview.policy.frequency} · ${overview.policy.storageProvider}` : 'No policy has been saved.' }}</p>
        </div>
      </AppCard>
      <AppCard :tone="capabilityTone">
        <div class="stack stack--sm">
          <AppBadge :tone="capabilityTone">{{ overview.connectionAssessment.restoreCapability }}</AppBadge>
          <h3>Restore capability</h3>
          <p class="text-meta">{{ overview.connectionAssessment.messages.join(' ') }}</p>
        </div>
      </AppCard>
      <AppCard muted>
        <div class="stack stack--sm">
          <AppBadge :tone="overview.storage.enabled && overview.storage.configured ? 'success' : 'warning'">
            {{ !overview.storage.enabled ? 'Disabled' : overview.storage.configured ? 'Configured' : 'Not configured' }}
          </AppBadge>
          <h3>Dropbox storage</h3>
          <p class="text-meta">{{ overview.storage.basePath || 'Base folder is not configured.' }}</p>
        </div>
      </AppCard>
      <AppCard muted>
        <div class="stack stack--sm">
          <AppBadge :tone="overview.latestBackup?.status === 'completed' ? 'success' : 'neutral'">{{ overview.latestBackup?.status ?? 'No backups' }}</AppBadge>
          <h3>Latest backup</h3>
          <p class="text-meta">{{ overview.latestBackup ? new Date(overview.latestBackup.startedAt).toLocaleString() : 'No backup artifacts recorded.' }}</p>
        </div>
      </AppCard>
    </div>

    <p v-if="notice" class="backup-message backup-message--notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="backup-message backup-message--error" role="alert">{{ errorMessage }}</p>

    <AppPanel title="Backup policy" description="Configure dashboard-owned backup intent, retention, and restore safeguards.">
      <form class="stack" @submit.prevent="savePolicy">
        <div class="grid">
          <AppCheckbox v-model="enabled" name="backup-enabled" label="Enable backup policy" description="Allows backup jobs to be prepared for this site." />
          <AppCheckbox v-model="filesEnabled" name="files-enabled" label="Include files" />
          <AppCheckbox v-model="databaseEnabled" name="database-enabled" label="Include database" />
          <AppCheckbox v-model="restoreEnabled" name="restore-enabled" label="Allow restore planning" description="Restore execution remains unavailable." />
        </div>
        <div class="grid">
          <AppSelect v-model="frequency" label="Backup frequency" name="backup-frequency" :options="[
            { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' }
          ]" />
          <AppSelect v-model="storageProvider" label="Storage provider" name="storage-provider" :options="[
            { label: 'Dropbox', value: 'dropbox' },
            { label: 'S3-compatible (coming soon)', value: 's3-compatible' },
            { label: 'Google Drive (coming soon)', value: 'google-drive' },
            { label: 'Local filesystem (coming soon)', value: 'local-filesystem' },
            { label: 'Backblaze B2 (coming soon)', value: 'backblaze-b2' }
          ]" />
          <AppSelect v-model="connectionType" label="Hosting connection" name="connection-type" :options="[
            { label: 'Local VPS path', value: 'local-vps' },
            { label: 'SSH/SFTP (placeholder)', value: 'ssh-sftp' },
            { label: 'SFTP only (placeholder)', value: 'sftp-only' },
            { label: 'Database credentials (placeholder)', value: 'database-credentials' },
            { label: 'Hosting API (placeholder)', value: 'hosting-api' },
            { label: 'Manual / unsupported', value: 'manual-unsupported' }
          ]" />
        </div>
        <div class="grid">
          <AppInput v-model="localPath" name="local-path" label="Local WordPress path" description="Must be inside a server-configured allowed base directory." />
          <AppInput v-model="providerLabel" name="provider-label" label="Hosting/provider label" />
          <AppCheckbox v-model="databaseConfigured" name="database-configured" label="Database access configured" description="Capability is derived from the encrypted database fields below." disabled />
        </div>
        <div class="section-heading"><h3>Database backup credentials</h3><p>The password is encrypted at rest and is never returned after saving. Leave it blank to retain the saved password.</p></div>
        <div class="grid">
          <AppInput v-model="databaseHost" name="database-host" label="Database host" />
          <AppInput v-model="databasePort" name="database-port" label="Database port" />
          <AppInput v-model="databaseName" name="database-name" label="Database name" />
          <AppInput v-model="databaseUsername" name="database-username" label="Database username" />
          <AppInput v-model="databasePassword" name="database-password" label="Database password" type="password" />
        </div>
        <div>
          <div class="section-heading"><h3>Retention</h3><p>Automatic deletion remains disabled until a tested cleanup runner exists.</p></div>
          <div class="grid">
            <AppInput v-model="keepDaily" name="keep-daily" label="Keep daily backups" />
            <AppInput v-model="keepWeekly" name="keep-weekly" label="Keep weekly backups" />
            <AppInput v-model="keepMonthly" name="keep-monthly" label="Keep monthly backups" />
            <AppCheckbox v-model="autoDeleteExpired" name="auto-delete" label="Auto-delete expired backups" description="Saved as intent only; no automatic deletion runs in Version One." />
          </div>
        </div>
        <AppTextarea v-model="notes" name="backup-notes" label="Backup policy notes" />
        <AppTextarea v-model="connectionNotes" name="connection-notes" label="Connection notes" />
        <div class="cluster">
          <AppButton type="submit" :loading="busy">Save backup policy</AppButton>
          <AppButton variant="secondary" :disabled="busy" @click="testConnection">Test hosting connection</AppButton>
          <AppButton variant="secondary" :disabled="busy" @click="testStorage">Test Dropbox</AppButton>
          <AppButton variant="secondary" :disabled="busy" @click="planBackup">Queue manual backup</AppButton>
        </div>
        <p class="text-meta">Backup execution occurs only in the separate background worker process.</p>
      </form>
    </AppPanel>

    <AppPanel title="Backup history" description="Durable backup artifact and evidence records.">
      <AppTable v-if="overview?.backups.length" caption="Backup history" :columns="['Started', 'Type', 'Status', 'Contents', 'Size', 'Evidence', 'Result', 'Actions']">
        <tr v-for="backup in overview.backups" :key="backup.id">
          <td>{{ new Date(backup.startedAt).toLocaleString() }}</td>
          <td>{{ backup.backupType }}</td>
          <td><AppBadge :tone="backup.status === 'completed' ? 'success' : backup.status === 'failed' ? 'danger' : 'info'">{{ backup.status }}</AppBadge></td>
          <td>{{ [backup.filesIncluded ? 'Files' : '', backup.databaseIncluded ? 'Database' : ''].filter(Boolean).join(' + ') }}</td>
          <td>{{ formatBytes(backup.sizeBytes) }}</td>
          <td>{{ backup.manifest ? 'Manifest available' : 'No manifest' }} · {{ backup.checksumVerifiedAt ? 'Checksums verified' : 'Checksums pending' }} · {{ backup.uploadVerifiedAt ? 'Upload verified' : 'Upload pending' }}</td>
          <td>{{ backup.errorMessage ?? (backup.status === 'completed' ? 'Completed successfully' : 'Waiting for worker') }}</td>
          <td>
            <div class="cluster">
              <AppButton variant="quiet" :disabled="busy || !backup.manifest" @click="viewManifest(backup.id)">View manifest</AppButton>
              <AppButton variant="quiet" :disabled="busy" @click="verifyBackup(backup.id)">Verify backup</AppButton>
              <AppButton v-if="backup.status === 'failed'" variant="quiet" :disabled="busy" @click="retryBackup(backup.id)">Retry as new job</AppButton>
              <AppButton variant="quiet" :disabled="busy" @click="prepareRestore(backup.id)">Prepare restore</AppButton>
            </div>
          </td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No backup history" description="Save a valid policy, then queue a manual backup for the background worker." />
    </AppPanel>

    <AppPanel title="Restore planner" description="Preflight-only restore plans. No destructive restore action exists.">
      <div v-if="overview?.restorePlans.length" class="stack">
        <AppCard v-for="plan in overview.restorePlans" :key="plan.id" :tone="plan.status === 'preflight-passed' ? 'warning' : 'danger'">
          <div class="stack stack--sm">
            <AppBadge :tone="plan.status === 'preflight-passed' ? 'warning' : 'danger'">{{ plan.status }}</AppBadge>
            <h3>{{ plan.restoreFiles ? 'Files' : '' }}{{ plan.restoreFiles && plan.restoreDatabase ? ' + ' : '' }}{{ plan.restoreDatabase ? 'Database' : '' }}</h3>
            <p class="text-meta">Capability: {{ plan.capability }} · Confirmation required · Execution unavailable</p>
            <p v-for="warning in plan.warnings" :key="warning" class="text-meta">{{ warning }}</p>
          </div>
        </AppCard>
      </div>
      <AppEmptyState v-else title="No restore plans" description="Prepare Restore from a backup artifact to record preflight checks and warnings." />
    </AppPanel>
  </div>
</template>

<style scoped>
.backup-message {
  margin-bottom: var(--space-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.backup-message--notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.backup-message--error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
