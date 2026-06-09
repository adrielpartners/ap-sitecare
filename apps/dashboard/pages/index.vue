<script setup lang="ts">
const siteSearch = ref('')

const sampleSites = [
  { name: 'Adriel Partners', status: 'Healthy', tone: 'success' as const, updates: '0' },
  { name: 'Sample Client', status: 'Attention', tone: 'warning' as const, updates: '3' },
  { name: 'Legacy Website', status: 'Unknown', tone: 'neutral' as const, updates: '—' }
]
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Design system foundation</p>
      <h1>Calm operational clarity.</h1>
      <p>
        A restrained visual foundation for quickly understanding what is healthy,
        what needs attention, and what remains unknown.
      </p>
    </header>

    <div class="stack">
      <section>
        <div class="section-heading">
          <h2>Site status pattern</h2>
          <p>Early card and badge patterns for the future health dashboard.</p>
        </div>
        <div class="grid">
          <AppCard v-for="site in sampleSites" :key="site.name" interactive>
            <div class="stack stack--sm">
              <div class="cluster">
                <AppBadge :tone="site.tone">{{ site.status }}</AppBadge>
                <span class="text-meta">Checked 8 minutes ago</span>
              </div>
              <div>
                <h3>{{ site.name }}</h3>
                <p class="text-meta">example.com</p>
              </div>
              <div class="cluster">
                <strong>{{ site.updates }}</strong>
                <span class="text-meta">updates available</span>
              </div>
            </div>
          </AppCard>
        </div>
      </section>

      <AppPanel
        title="Interface controls"
        description="Reusable controls with clear hover, focus, disabled, loading, and error states."
      >
        <template #actions>
          <AppButton variant="secondary">Secondary action</AppButton>
        </template>
        <div class="stack">
          <AppInput
            v-model="siteSearch"
            name="site-search"
            label="Find a managed site"
            placeholder="Search by site name or URL"
            description="Search will be connected to live site data in a later phase."
            type="search"
          />
          <div class="cluster">
            <AppButton>Primary action</AppButton>
            <AppButton variant="secondary">Secondary</AppButton>
            <AppButton variant="quiet">Quiet action</AppButton>
            <AppButton loading>Checking</AppButton>
            <AppButton disabled>Disabled</AppButton>
          </div>
          <div class="cluster">
            <AppBadge tone="success">Healthy</AppBadge>
            <AppBadge tone="warning">Attention needed</AppBadge>
            <AppBadge tone="danger">Critical</AppBadge>
            <AppBadge tone="info">Informational</AppBadge>
            <AppBadge>Unknown</AppBadge>
          </div>
        </div>
      </AppPanel>

      <section>
        <div class="section-heading">
          <h2>Operational table</h2>
          <p>A responsive table surface for compact scanning.</p>
        </div>
        <AppTable caption="Sample managed sites" :columns="['Site', 'Health', 'Updates', 'Last check-in']">
          <tr v-for="site in sampleSites" :key="site.name">
            <td>{{ site.name }}</td>
            <td><AppBadge :tone="site.tone">{{ site.status }}</AppBadge></td>
            <td>{{ site.updates }}</td>
            <td class="text-muted">8 minutes ago</td>
          </tr>
        </AppTable>
      </section>

      <AppPanel
        title="Empty state pattern"
        description="Useful guidance without noise or false urgency."
      >
        <AppEmptyState
          title="No sites need attention"
          description="When a managed site develops a health issue, it will appear here with clear context and a recommended next step."
        >
          <template #actions>
            <AppButton variant="secondary">Review all sites</AppButton>
          </template>
        </AppEmptyState>
      </AppPanel>
    </div>
  </div>
</template>

