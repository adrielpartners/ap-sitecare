<script setup lang="ts">
useHead({ title: 'System health' })
const { data: response, refresh, status } = await useFetch<any>('/api/admin/operations/health')
const health = computed(() => response.value?.data)
function tone(value: string): 'success'|'warning'|'danger'|'info' { return value === 'healthy' ? 'success' : value === 'critical' ? 'danger' : value === 'attention' ? 'warning' : 'info' }
function label(value: string): string { return value.replace(/([A-Z])/g, ' $1').replace(/^./, item => item.toUpperCase()) }
</script>

<template>
  <div>
    <header class="page-heading operations-heading"><div><p class="eyebrow">Operations</p><h1>System health</h1><p>Worker queues, integration degradation, production configuration, and active incidents without exposing secrets.</p></div><AppButton variant="secondary" :loading="status === 'pending'" @click="refresh">Refresh</AppButton></header>
    <div v-if="health" class="stack">
      <div class="grid"><AppStatCard label="Overall" :value="health.status" description="Current application health" :tone="tone(health.status)" /><AppStatCard label="Active sites" :value="health.database.activeSiteCount" description="PostgreSQL connected" tone="success" /><AppStatCard label="Open uptime incidents" :value="health.incidents.openUptime" description="Confirmed client downtime" :tone="health.incidents.openUptime ? 'danger' : 'success'" /><AppStatCard label="Open TLS alerts" :value="health.incidents.openTls" description="Separate certificate alerts" :tone="health.incidents.openTls ? 'warning' : 'success'" /></div>
      <AppPanel title="Workers and integrations" :description="`Checked ${new Date(health.checkedAt).toLocaleString()}`"><div class="health-grid"><AppCard v-for="(item,key) in health.components" :key="key" :tone="tone(item.status)"><div class="cluster cluster--between"><strong>{{ label(String(key)) }}</strong><AppBadge :tone="tone(item.status)">{{ item.status }}</AppBadge></div><p class="text-meta">{{ item.failed }} failed · {{ item.stale }} stale</p></AppCard></div></AppPanel>
      <AppPanel title="Production configuration" description="Presence checks only. Secret values are never returned."><AppTable caption="Production configuration readiness" :columns="['Setting','State']"><tr v-for="(configured,key) in health.configuration" :key="key"><td>{{ label(String(key)) }}</td><td><AppBadge :tone="configured ? 'success' : 'warning'">{{ configured ? 'Configured' : 'Missing or deferred' }}</AppBadge></td></tr></AppTable></AppPanel>
      <AppPanel title="Database schema"><p>Latest migration: <strong>{{ health.database.migration?.id }} · {{ health.database.migration?.name }}</strong></p><p class="text-meta">Applied {{ health.database.migration ? new Date(health.database.migration.applied_at).toLocaleString() : 'unknown' }}</p></AppPanel>
    </div>
  </div>
</template>

<style scoped>.operations-heading{display:flex;align-items:end;justify-content:space-between;gap:var(--space-4)}.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:var(--space-3)}@media(max-width:52rem){.operations-heading{align-items:start;flex-direction:column}}</style>
