<script setup lang="ts">
useHead({ title: 'SiteHealth Reviews' })
const api = useSiteCareApi()
const { data: session } = await useFetch<any>('/api/session')
const isClient = computed(() => session.value?.user?.role === 'client')
const endpoint = computed(() => isClient.value ? '/api/client/sitehealth/reviews' : '/api/reports')
const { data: response, refresh } = await useFetch<any>(endpoint)
const { data: sitesResponse } = await useFetch<any>('/api/sites', { immediate: !isClient.value })
const entries = computed(() => response.value?.data ?? [])
const sites = computed(() => sitesResponse.value?.data ?? [])
const selectedSiteId = ref('')
const includeBrokenLinks = ref(false)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

watch(sites, (value: any[]) => {
  if (!selectedSiteId.value && value.length) selectedSiteId.value = value[0].id
}, { immediate: true })

function tone(status: string) {
  return ({ 'draft-ready': 'success', running: 'info', queued: 'warning', failed: 'danger', cancelled: 'neutral' } as const)[status as 'draft-ready'] ?? 'neutral'
}

async function runCheckup() {
  if (!selectedSiteId.value) return
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await api(`/api/sites/${selectedSiteId.value}/sitehealth/checkups`, { method: 'POST', body: { includeBrokenLinks: includeBrokenLinks.value } })
    notice.value = 'SiteHealth Checkup queued.'
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The Checkup could not be queued.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">SiteHealth</p>
      <h1>{{ isClient ? 'Your SiteHealth Reviews' : 'Checkups and Reviews' }}</h1>
      <p>{{ isClient ? 'Published Reviews from your SiteCare team.' : 'Run Checkups, review evidence, publish client-safe Reviews, and record external approval.' }}</p>
    </header>

    <div class="stack">
      <AppPanel v-if="!isClient" title="Manual SiteHealth Checkup" description="Available for any managed site regardless of plan.">
        <div class="stack">
          <AppSelect v-model="selectedSiteId" name="site" label="Site" :options="sites.map((site: any) => ({ label: site.name, value: site.id }))" />
          <AppCheckbox v-model="includeBrokenLinks" name="broken-links" label="Check same-site homepage links" description="Optional; bounded to 25 links." />
          <div class="cluster">
            <AppButton :loading="busy" :disabled="!selectedSiteId" @click="runCheckup">Run SiteHealth Checkup</AppButton>
            <AppButton variant="secondary" :disabled="busy" @click="refresh">Refresh</AppButton>
          </div>
          <p v-if="notice" class="notice">{{ notice }}</p>
          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        </div>
      </AppPanel>

      <AppPanel :title="isClient ? 'Published Reviews' : 'Checkup history'" :description="`${entries.length} records`">
        <AppTable v-if="entries.length && !isClient" caption="SiteHealth Checkup history" :columns="['Site', 'Created', 'Trigger', 'Status', 'Review', '']">
          <tr v-for="entry in entries" :key="entry.id">
            <td><strong>{{ entry.site.name }}</strong><br><span class="text-meta">{{ entry.site.url }}</span></td>
            <td>{{ new Date(entry.createdAt).toLocaleString() }}</td>
            <td>{{ entry.triggerType }}</td>
            <td><AppBadge :tone="tone(entry.status)">{{ entry.status }}</AppBadge></td>
            <td>{{ entry.latestReview ? `v${entry.latestReview.version} · ${entry.latestReview.status}` : 'Pending' }}</td>
            <td><AppButton :to="`/sitehealth/checkups/${entry.id}`" variant="secondary">Open workspace</AppButton></td>
          </tr>
        </AppTable>
        <div v-else-if="entries.length" class="grid">
          <AppCard v-for="review in entries" :key="review.id" muted>
            <div class="stack stack--sm">
              <AppBadge tone="success">{{ review.status }}</AppBadge>
              <h3>{{ review.title }}</h3>
              <p class="text-meta">Published {{ review.publishedAt ? new Date(review.publishedAt).toLocaleDateString() : 'recently' }}</p>
              <AppButton :to="`/reports/${review.id}`" variant="secondary">Read Review</AppButton>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No SiteHealth Reviews yet" description="Published Reviews will appear here." />
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.notice,
.error { margin: 0; padding: var(--space-3); border-radius: var(--radius-md); }
.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }
</style>
