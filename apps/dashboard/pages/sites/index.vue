<script setup lang="ts">
const search = ref('')
const statusFilter = ref('all')
const riskFilter = ref('all')
const sort = ref('name')
const { data: response, refresh } = await useFetch('/api/sites')
const { data: healthResponse } = await useFetch('/api/site-health')
const sites = computed(() => response.value?.data ?? [])
const healthBySite = computed(() => new Map((healthResponse.value?.data ?? []).map(summary => [summary.siteId, summary])))
const filteredSites = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return sites.value
  return sites.value
    .filter(site => !query
      || site.name.toLowerCase().includes(query)
      || site.url.toLowerCase().includes(query)
      || site.hostingProvider?.toLowerCase().includes(query))
    .filter(site => statusFilter.value === 'all' || healthBySite.value.get(site.id)?.status === statusFilter.value)
    .filter(site => riskFilter.value === 'all' || site.riskLevel === riskFilter.value)
    .sort((a, b) => sort.value === 'risk'
      ? ({ high: 0, standard: 1, low: 2 }[a.riskLevel] - { high: 0, standard: 1, low: 2 }[b.riskLevel])
      : a.name.localeCompare(b.name))
})

await refresh()
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Managed sites</p>
      <h1>Site inventory</h1>
      <p>Register, review, and prepare WordPress sites for secure health reporting.</p>
    </header>

    <AppPanel title="Sites" :description="`${sites.length} registered sites`">
      <template #actions>
        <AppButton to="/sites/new">Add site</AppButton>
      </template>
      <div v-if="sites.length" class="stack">
        <AppInput
          v-model="search"
          label="Find a managed site"
          name="site-search"
          placeholder="Search by name or URL"
          type="search"
        />
        <div class="grid">
          <AppSelect
            v-model="statusFilter"
            label="Health status"
            name="health-filter"
            :options="[
              { label: 'All health statuses', value: 'all' },
              { label: 'Healthy', value: 'healthy' },
              { label: 'Attention needed', value: 'attention' },
              { label: 'Critical', value: 'critical' },
              { label: 'Unknown', value: 'unknown' }
            ]"
          />
          <AppSelect
            v-model="riskFilter"
            label="Risk level"
            name="risk-filter"
            :options="[
              { label: 'All risk levels', value: 'all' },
              { label: 'High', value: 'high' },
              { label: 'Standard', value: 'standard' },
              { label: 'Low', value: 'low' }
            ]"
          />
          <AppSelect
            v-model="sort"
            label="Sort sites"
            name="site-sort"
            :options="[
              { label: 'Name', value: 'name' },
              { label: 'Risk level', value: 'risk' }
            ]"
          />
        </div>
        <div class="grid">
          <SiteHealthCard
            v-for="site in filteredSites"
            :key="site.id"
            :site="site"
            :health="healthBySite.get(site.id)!"
          />
        </div>
      </div>
      <AppEmptyState
        v-else
        title="No managed sites yet"
        description="Register the first site to generate credentials and prepare its reporter connection."
      >
        <template #actions>
          <AppButton to="/sites/new">Add site</AppButton>
        </template>
      </AppEmptyState>
    </AppPanel>
  </div>
</template>
