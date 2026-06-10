<script setup lang="ts">
defineProps<{
  site: {
    id: string
    name: string
    url: string
    status: 'active' | 'disabled'
    hostingProvider: string | null
    backupStrategy: string | null
    riskLevel: 'low' | 'standard' | 'high'
  }
  health: {
    status: 'healthy' | 'attention' | 'critical' | 'unknown'
    reason: string
    latest: null | {
      pluginUpdateCount: number
      themeUpdateCount: number
      createdAt: string
    }
  }
}>()
</script>

<template>
  <AppCard interactive :muted="site.status === 'disabled'">
    <div class="stack stack--sm">
      <div class="cluster cluster--between">
        <SiteHealthBadge :status="health.status" />
        <AppBadge v-if="site.status === 'disabled'" tone="neutral">Disabled</AppBadge>
      </div>
      <div>
        <h2>{{ site.name }}</h2>
        <p class="text-meta">{{ site.url }}</p>
      </div>
      <p>{{ health.reason }}</p>
      <p class="text-meta">
        {{ site.hostingProvider ?? 'Host unknown' }} · {{ site.backupStrategy ?? 'Backup strategy not recorded' }} · {{ site.riskLevel }} risk
      </p>
      <div v-if="health.latest" class="health-metrics">
        <span>{{ health.latest.pluginUpdateCount }} plugin updates</span>
        <span>{{ health.latest.themeUpdateCount }} theme updates</span>
      </div>
      <AppButton :to="`/sites/${site.id}`" variant="secondary">View site</AppButton>
    </div>
  </AppCard>
</template>

<style scoped>
.health-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
