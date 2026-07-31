<script setup lang="ts">
const { data: response, error } = await useFetch('/api/dashboard-overview?page=1&pageSize=25')
const sites = computed(() => response.value?.data?.sites?.items ?? [])

function tone(status: string) {
  if (status === 'healthy') return 'success'
  if (status === 'critical') return 'danger'
  if (status === 'attention') return 'warning'
  return 'neutral'
}
</script>

<template>
  <div class="stack">
    <header class="page-heading">
      <p class="eyebrow">Cloudflare</p>
      <h1>Security Status</h1>
      <p>Portfolio-level status from the read-only Cloudflare checklist. Open a site to review each setting and record technician evidence.</p>
    </header>
    <p v-if="error" class="security-error" role="alert">Security portfolio status could not be loaded.</p>
    <AppPanel v-else title="Managed sites" description="Red needs action, yellow needs review, and green is active based on the latest API or technician evidence.">
      <AppTable v-if="sites.length" caption="Cloudflare security status by site" :columns="['Site', 'Security', 'TLS', 'Action']">
        <tr v-for="site in sites" :key="site.id">
          <td><strong>{{ site.name }}</strong><br><span class="text-meta">{{ site.url }}</span></td>
          <td><AppBadge :tone="tone(site.securityStatus)">{{ site.securityStatus }}</AppBadge></td>
          <td><AppBadge :tone="tone(site.sslStatus)">{{ site.sslStatus }}</AppBadge></td>
          <td><AppButton :to="`/sites/${site.id}?tab=security`" variant="secondary">Review checklist</AppButton></td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No managed sites" description="Add a site before synchronizing Cloudflare Security Status." />
    </AppPanel>
  </div>
</template>

<style scoped>
.security-error { padding: var(--space-4); border-radius: var(--radius-md); background: var(--color-danger-soft); color: var(--color-danger); }
</style>
