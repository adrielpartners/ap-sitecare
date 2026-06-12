<script setup lang="ts">
const { data: response } = await useFetch('/api/backups')
const sites = computed(() => response.value?.data ?? [])

function capabilityTone(capability: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (capability === 'full') return 'success'
  if (capability === 'partial') return 'warning'
  if (capability === 'backup-only') return 'info'
  return 'neutral'
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Remote backup management</p>
      <h1>Backup readiness</h1>
      <p>Review backup policies and honest restore capability across all managed sites.</p>
    </header>

    <AppPanel title="Managed backup policies" :description="`${sites.length} managed sites`">
      <AppTable v-if="sites.length" caption="Managed backup policies" :columns="['Site', 'Policy', 'Latest backup', 'Size', 'Evidence', 'Connection', 'Restore capability', 'Action']">
        <tr v-for="entry in sites" :key="entry.site.id">
          <td><strong>{{ entry.site.name }}</strong><br><span class="text-meta">{{ entry.site.url }}</span></td>
          <td><AppBadge :tone="entry.policy?.enabled ? 'success' : 'neutral'">{{ entry.policy?.enabled ? entry.policy.frequency : 'Not enabled' }}</AppBadge></td>
          <td><AppBadge :tone="entry.latestBackup?.status === 'completed' ? 'success' : entry.latestBackup?.status === 'failed' ? 'danger' : 'info'">{{ entry.latestBackup?.status ?? 'None' }}</AppBadge><br><span v-if="entry.latestBackup?.errorMessage" class="text-meta">{{ entry.latestBackup.errorMessage }}</span></td>
          <td>{{ entry.latestBackup?.sizeBytes ? `${(entry.latestBackup.sizeBytes / 1024 / 1024).toFixed(1)} MB` : 'Unknown' }}</td>
          <td>{{ entry.latestBackup?.manifest ? 'Manifest' : 'No manifest' }} · {{ entry.latestBackup?.checksumVerifiedAt ? 'Checksums verified' : 'Unverified' }}</td>
          <td>{{ entry.connection?.connectionType ?? 'Not configured' }}</td>
          <td><AppBadge :tone="capabilityTone(entry.restoreCapability)">{{ entry.restoreCapability }}</AppBadge></td>
          <td><AppButton :to="`/sites/${entry.site.id}`" variant="secondary">Manage backups</AppButton></td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No managed sites" description="Register a site before configuring a remote backup policy." />
    </AppPanel>
  </div>
</template>
