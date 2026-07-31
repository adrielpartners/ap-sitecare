<script setup lang="ts">
useHead({ title: 'My SiteCare' })
const { data: response } = await useFetch('/api/client/portal')
const portal = computed(() => response.value?.data)
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Client Dashboard</p>
      <h1>Welcome, {{ portal?.user.displayName }}</h1>
      <p>Your safe, read-only SiteCare overview. Detailed service status will be added in its scheduled product phases.</p>
    </header>
    <AppPanel title="Your websites" :description="`${portal?.sites.length ?? 0} connected sites`">
      <div v-if="portal?.sites.length" class="grid">
        <AppCard v-for="site in portal.sites" :key="site.id" :tone="site.status === 'active' ? 'success' : 'warning'">
          <h3>{{ site.name }}</h3>
          <p class="text-meta">{{ site.url }}</p>
          <AppBadge :tone="site.status === 'active' ? 'success' : 'warning'">{{ site.status }}</AppBadge>
        </AppCard>
      </div>
      <AppEmptyState v-else title="No websites assigned" description="Your SiteCare team can connect websites to this client account." />
    </AppPanel>
  </div>
</template>
