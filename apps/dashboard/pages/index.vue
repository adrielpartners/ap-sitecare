<script setup lang="ts">
const page = ref(1)
const search = ref('')
const searchQuery = ref('')
const { data: response, error, status } = await useFetch(
  () => `/api/dashboard-overview?page=${page.value}&pageSize=5&search=${encodeURIComponent(searchQuery.value)}`
)
const overview = computed(() => response.value?.data)

function applySearch() {
  page.value = 1
  searchQuery.value = search.value
}
</script>

<template>
  <div class="dashboard-page">
    <header class="page-heading dashboard-page__heading">
      <p class="eyebrow">Operations Overview</p>
      <h1>{{ overview?.aggregates.criticalIssues ? 'Critical issues need review.' : overview?.aggregates.attentionSites ? 'Some sites need attention.' : overview?.aggregates.totalManagedSites ? 'All systems healthy.' : 'Ready to monitor your first site.' }}</h1>
      <p>A real-time view across all managed WordPress websites.</p>
    </header>

    <div v-if="error" class="dashboard-error" role="alert">
      Dashboard data could not be loaded. Try refreshing the page.
    </div>
    <div v-else-if="status === 'pending' && !overview" class="dashboard-loading" role="status">
      Loading operational overview…
    </div>
    <template v-else-if="overview">
      <section class="dashboard-overview-grid" aria-label="Portfolio status">
        <AppStatCard
          label="Healthy Sites"
          :value="overview.aggregates.healthySites"
          :percentage="overview.aggregates.healthDistribution.healthy"
          description="of total"
          tone="success"
        />
        <AppStatCard
          label="Needs Attention"
          :value="overview.aggregates.attentionSites"
          :percentage="overview.aggregates.healthDistribution.attention"
          description="of total"
          tone="warning"
        />
        <AppStatCard
          label="Critical Issues"
          :value="overview.aggregates.criticalIssues"
          :percentage="overview.aggregates.healthDistribution.critical"
          description="of total"
          tone="danger"
        />
        <HealthDistributionCard
          :distribution="overview.aggregates.healthDistribution"
          :total="overview.aggregates.totalManagedSites"
        />
      </section>

      <section class="dashboard-content-grid">
        <AppPanel
          class="dashboard-sites-panel"
          title="Managed Sites"
          :description="`${overview.sites.totalItems} active managed sites`"
        >
          <template #actions>
            <AppButton to="/sites/new">Add Site</AppButton>
          </template>
          <div v-if="overview.aggregates.totalManagedSites" class="stack">
            <form class="dashboard-search" role="search" @submit.prevent="applySearch">
              <AppInput
                v-model="search"
                label="Search managed sites"
                name="dashboard-site-search"
                placeholder="Search by site name or URL"
                type="search"
              />
              <AppButton type="submit" variant="secondary">Search</AppButton>
            </form>
            <ManagedSitesTable
              :sites="overview.sites.items"
              :page="overview.sites.page"
              :total-pages="overview.sites.totalPages"
              @change-page="page = $event"
            />
            <AppButton to="/sites" variant="quiet">View all sites</AppButton>
          </div>
          <AppEmptyState
            v-else
            title="No managed sites yet"
            description="Register the first WordPress website to begin monitoring real operational health."
          >
            <template #actions>
              <AppButton to="/sites/new">Register First Site</AppButton>
            </template>
          </AppEmptyState>
        </AppPanel>

        <div class="dashboard-side-stack">
          <AppPanel title="Recent Activity" description="Latest recorded operational events.">
            <RecentActivityList :activities="overview.recentActivity" />
          </AppPanel>
          <AppPanel title="Next Scheduled Tasks" description="Computed schedule placeholders for future job integrations.">
            <ScheduledTasksList :tasks="overview.scheduledTasks" />
          </AppPanel>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: grid;
  gap: var(--space-8);
}

.dashboard-page__heading {
  margin-bottom: var(--space-0);
}

.dashboard-page__heading h1 {
  margin-bottom: var(--space-3);
  font-size: var(--font-size-3xl);
  text-shadow: var(--shadow-sm);
}

.dashboard-overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-5);
}

.dashboard-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(19rem, 0.8fr);
  align-items: start;
  gap: var(--space-5);
}

.dashboard-side-stack {
  display: grid;
  gap: var(--space-5);
}

.dashboard-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-3);
}

.dashboard-error,
.dashboard-loading {
  padding: var(--space-5);
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.dashboard-error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

@media (max-width: 84rem) {
  .dashboard-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 72rem) {
  .dashboard-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 42rem) {
  .dashboard-overview-grid,
  .dashboard-search {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
