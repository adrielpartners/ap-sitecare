<script setup lang="ts">
defineProps<{
  sites: Array<{
    id: string
    name: string
    url: string
    status: 'healthy' | 'attention' | 'critical' | 'unknown'
    uptimeStatus: 'healthy' | 'attention' | 'critical' | 'unknown'
    updateStatus: 'healthy' | 'attention' | 'critical' | 'unknown'
    pendingUpdateCount: number | null
    securityStatus: 'healthy' | 'attention' | 'critical' | 'unknown'
    lastCheckInAt: string | null
  }>
  page: number
  totalPages: number
}>()

const emit = defineEmits<{
  'change-page': [page: number]
}>()
</script>

<template>
  <div class="managed-sites-table">
    <AppTable
      caption="Managed WordPress sites"
      :columns="['Site', 'Status', 'Uptime', 'Updates', 'Security', 'Last check-in', '']"
    >
      <tr v-for="site in sites" :key="site.id">
        <td>
          <strong>{{ site.name }}</strong>
          <span class="managed-sites-table__url">{{ site.url }}</span>
        </td>
        <td><StatusBadge :status="site.status" /></td>
        <td><StatusBadge :status="site.uptimeStatus" /></td>
        <td>
          <StatusBadge :status="site.updateStatus" />
          <span v-if="site.pendingUpdateCount !== null" class="managed-sites-table__meta">
            {{ site.pendingUpdateCount }} pending
          </span>
        </td>
        <td><StatusBadge :status="site.securityStatus" /></td>
        <td>{{ site.lastCheckInAt ? new Date(site.lastCheckInAt).toLocaleString() : 'Never' }}</td>
        <td><AppButton :to="`/sites/${site.id}`" variant="quiet">View</AppButton></td>
      </tr>
    </AppTable>
    <footer v-if="totalPages > 1" class="managed-sites-table__pagination">
      <AppButton :disabled="page <= 1" variant="secondary" @click="emit('change-page', page - 1)">Previous</AppButton>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <AppButton :disabled="page >= totalPages" variant="secondary" @click="emit('change-page', page + 1)">Next</AppButton>
    </footer>
  </div>
</template>

<style scoped>
.managed-sites-table__url,
.managed-sites-table__meta {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.managed-sites-table__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
