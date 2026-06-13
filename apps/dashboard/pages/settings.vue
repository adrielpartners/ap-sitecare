<script setup lang="ts">
const { data: response, refresh } = await useFetch('/api/backup-destinations')
const destinations = computed(() => response.value && 'data' in response.value ? response.value.data : [])
const editingId = ref('')
const name = ref('')
const provider = ref('dropbox')
const enabled = ref(true)
const inMasterPool = ref(true)
const credential = ref('')
const basePath = ref('/AP-SiteCare')
const folderId = ref('')
const bucket = ref('')
const region = ref('')
const endpoint = ref('')
const accessKeyId = ref('')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

function resetForm() {
  editingId.value = ''
  name.value = ''
  provider.value = 'dropbox'
  enabled.value = true
  inMasterPool.value = true
  credential.value = ''
  basePath.value = '/AP-SiteCare'
  folderId.value = ''
  bucket.value = ''
  region.value = ''
  endpoint.value = ''
  accessKeyId.value = ''
}

function editDestination(destination: any) {
  editingId.value = destination.id
  name.value = destination.name
  provider.value = destination.provider
  enabled.value = destination.enabled
  inMasterPool.value = destination.inMasterPool
  credential.value = ''
  basePath.value = destination.configuration.basePath ?? ''
  folderId.value = destination.configuration.folderId ?? ''
  bucket.value = destination.configuration.bucket ?? ''
  region.value = destination.configuration.region ?? ''
  endpoint.value = destination.configuration.endpoint ?? ''
  accessKeyId.value = destination.configuration.accessKeyId ?? ''
}

async function saveDestination() {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const configuration = provider.value === 'dropbox'
      ? { basePath: basePath.value }
      : provider.value === 'google-drive'
        ? { folderId: folderId.value }
        : { bucket: bucket.value, region: region.value, endpoint: endpoint.value, basePath: basePath.value, accessKeyId: accessKeyId.value }
    await $fetch(editingId.value ? `/api/backup-destinations/${editingId.value}` : '/api/backup-destinations', {
      method: editingId.value ? 'PUT' : 'POST',
      body: {
        name: name.value,
        provider: provider.value,
        enabled: enabled.value,
        inMasterPool: inMasterPool.value,
        configuration,
        credential: credential.value || undefined
      }
    })
    notice.value = editingId.value ? 'Backup destination updated.' : 'Backup destination created.'
    resetForm()
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The backup destination could not be saved.'
  } finally {
    busy.value = false
  }
}

async function testDestination(id: string) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const result = await $fetch(`/api/backup-destinations/${id}/test`, { method: 'POST' })
    notice.value = 'data' in result ? result.data.message : 'Destination test completed.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The backup destination could not be tested.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Settings</p>
      <h1>Backup destinations</h1>
      <p>Manage the central storage pool inherited by client sites unless they have a site-specific override.</p>
    </header>

    <div class="stack">
      <p v-if="notice" class="settings-message settings-message--notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="settings-message settings-message--error" role="alert">{{ errorMessage }}</p>

      <AppPanel title="Backup setup checklist" description="Secrets are entered here in the dashboard. SiteCare encrypts them before storing them.">
        <div class="grid">
          <AppCard muted>
            <div class="stack stack--sm">
              <AppBadge tone="info">1. Storage destination</AppBadge>
              <h3>Add Dropbox access</h3>
              <p class="text-meta">Create a Dropbox app access token, enter it below, save the destination, then use Test connection. The token is never shown again.</p>
              <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer">Open Dropbox App Console</a>
            </div>
          </AppCard>
          <AppCard muted>
            <div class="stack stack--sm">
              <AppBadge tone="info">2. Site source</AppBadge>
              <h3>Connect each WordPress site</h3>
              <p class="text-meta">On each site page, configure the Local VPS WordPress path and database credentials. Passwords are encrypted and never returned.</p>
              <NuxtLink to="/sites">Open managed sites</NuxtLink>
            </div>
          </AppCard>
          <AppCard muted>
            <div class="stack stack--sm">
              <AppBadge tone="warning">Current execution boundary</AppBadge>
              <h3>Remote hosting needs a mounted source</h3>
              <p class="text-meta">The active worker supports Local VPS sources only. Remote sites must be mounted read-only under <code>/opt/sitecare/backup-sources</code> before backups can run.</p>
            </div>
          </AppCard>
        </div>
      </AppPanel>

      <AppPanel title="Central destination pool" description="Enabled destinations marked for the master pool become the default storage choices for managed sites.">
        <div v-if="destinations.length" class="grid">
          <AppCard v-for="destination in destinations" :key="destination.id" :tone="destination.enabled && destination.inMasterPool ? 'success' : 'neutral'">
            <div class="stack stack--sm">
              <div class="cluster">
                <AppBadge :tone="destination.enabled ? 'success' : 'neutral'">{{ destination.enabled ? 'Enabled' : 'Disabled' }}</AppBadge>
                <AppBadge :tone="destination.inMasterPool ? 'info' : 'neutral'">{{ destination.inMasterPool ? 'Master pool' : 'Optional' }}</AppBadge>
                <AppBadge :tone="destination.executable ? 'success' : 'warning'">{{ destination.executable ? 'Execution ready' : 'Adapter pending' }}</AppBadge>
              </div>
              <h3>{{ destination.name }}</h3>
              <p class="text-meta">{{ destination.provider }} · {{ destination.credentialConfigured ? 'Credential configured' : 'Credential required' }}</p>
              <p v-if="destination.credentialSource === 'runtime'" class="text-meta">Managed by VPS environment configuration.</p>
              <div class="cluster">
                <AppButton variant="secondary" :disabled="busy" @click="testDestination(destination.id)">Test connection</AppButton>
                <AppButton v-if="destination.credentialSource !== 'runtime'" variant="secondary" :disabled="busy" @click="editDestination(destination)">Edit destination</AppButton>
              </div>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No backup destinations" description="Add the first shared backup destination below." />
      </AppPanel>

      <AppPanel :title="editingId ? 'Edit backup destination' : 'Add backup destination'" description="Credentials are encrypted at rest and are never returned after saving.">
        <form class="stack" @submit.prevent="saveDestination">
          <div class="grid">
            <AppInput v-model="name" label="Destination name" name="destination-name" placeholder="Primary Dropbox" />
            <AppSelect v-model="provider" label="Provider" name="destination-provider" :options="[
              { label: 'Dropbox', value: 'dropbox' },
              { label: 'Google Drive (adapter pending)', value: 'google-drive' },
              { label: 'Amazon / S3-compatible (adapter pending)', value: 's3-compatible' }
            ]" />
            <AppCheckbox v-model="enabled" name="destination-enabled" label="Enable destination" />
            <AppCheckbox v-model="inMasterPool" name="destination-master-pool" label="Include in central pool" description="Sites using master settings inherit this destination." />
          </div>

          <div v-if="provider === 'dropbox'" class="grid">
            <AppInput v-model="basePath" label="Dropbox base path" name="dropbox-base-path" />
            <AppInput v-model="credential" label="Dropbox access token" name="dropbox-token" type="password" description="Leave blank while editing to retain the saved token." />
          </div>
          <div v-else-if="provider === 'google-drive'" class="grid">
            <AppInput v-model="folderId" label="Google Drive folder ID" name="google-folder-id" />
            <AppInput v-model="credential" label="Google service credential" name="google-credential" type="password" description="Saved securely; execution adapter is not implemented yet." />
          </div>
          <div v-else class="grid">
            <AppInput v-model="bucket" label="Bucket" name="s3-bucket" />
            <AppInput v-model="region" label="Region" name="s3-region" />
            <AppInput v-model="endpoint" label="Custom endpoint (optional)" name="s3-endpoint" />
            <AppInput v-model="basePath" label="Base path (optional)" name="s3-base-path" />
            <AppInput v-model="accessKeyId" label="Access key ID" name="s3-access-key" />
            <AppInput v-model="credential" label="Secret access key" name="s3-secret-key" type="password" description="Saved securely; execution adapter is not implemented yet." />
          </div>

          <div class="cluster">
            <AppButton type="submit" :loading="busy">{{ editingId ? 'Update destination' : 'Add destination' }}</AppButton>
            <AppButton v-if="editingId" variant="secondary" :disabled="busy" @click="resetForm">Cancel edit</AppButton>
          </div>
        </form>
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.settings-message {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.settings-message--notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.settings-message--error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
