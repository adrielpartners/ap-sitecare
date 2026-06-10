<script setup lang="ts">
const { data: sitesResponse } = await useFetch('/api/sites')
const { data: healthResponse } = await useFetch('/api/site-health')
const sites = computed(() => sitesResponse.value?.data ?? [])
const health = computed(() => healthResponse.value?.data ?? [])
const activeCount = computed(() => sites.value.filter(site => site.status === 'active').length)
const criticalCount = computed(() => health.value.filter(item => item.status === 'critical').length)
const attentionCount = computed(() => health.value.filter(item => item.status === 'attention').length)
const healthBySite = computed(() => new Map(health.value.map(summary => [summary.siteId, summary])))
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Operations overview</p>
      <h1>Are all managed sites healthy and protected?</h1>
      <p>A calm operational view of every managed WordPress website.</p>
    </header>

    <div class="grid">
      <AppCard>
        <div class="stack stack--sm">
          <AppBadge tone="info">Managed sites</AppBadge>
          <h2>{{ sites.length }}</h2>
          <p class="text-meta">{{ activeCount }} active</p>
        </div>
      </AppCard>
      <AppCard>
        <div class="stack stack--sm">
          <AppBadge :tone="criticalCount ? 'danger' : 'success'">Critical</AppBadge>
          <h2>{{ criticalCount }}</h2>
          <p class="text-meta">Sites needing immediate review</p>
        </div>
      </AppCard>
      <AppCard>
        <div class="stack stack--sm">
          <AppBadge :tone="attentionCount ? 'warning' : 'success'">Attention</AppBadge>
          <h2>{{ attentionCount }}</h2>
          <p class="text-meta">Sites with available updates</p>
        </div>
      </AppCard>
    </div>

    <AppPanel
      class="overview-panel"
      title="Managed site inventory"
      description="Review current WordPress health and update posture."
    >
      <template #actions>
        <AppButton to="/sites/new">Add site</AppButton>
      </template>
      <AppEmptyState
        v-if="sites.length === 0"
        title="No managed sites yet"
        description="Add the first WordPress website to begin building the operational inventory."
      >
        <template #actions>
          <AppButton to="/sites/new">Register first site</AppButton>
        </template>
      </AppEmptyState>
      <div v-else class="grid">
        <SiteHealthCard
          v-for="site in sites"
          :key="site.id"
          :site="site"
          :health="healthBySite.get(site.id)!"
        />
      </div>
    </AppPanel>
  </div>
</template>

<style scoped>
.overview-panel {
  margin-top: var(--space-6);
}
</style>
