<script setup lang="ts">
const props = defineProps<{ siteId: string }>()
const api = useSiteCareApi()
const { data: response, refresh } = await useFetch<any>(() => `/api/sites/${props.siteId}/sitehealth`)
const overview = computed(() => response.value?.data)
const includeBrokenLinks = ref(false)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

function tone(status: string) {
  return ({ 'draft-ready': 'success', running: 'info', queued: 'warning', failed: 'danger', cancelled: 'neutral' } as const)[status as 'draft-ready'] ?? 'neutral'
}

async function runCheckup() {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await api(`/api/sites/${props.siteId}/sitehealth/checkups`, { method: 'POST', body: { includeBrokenLinks: includeBrokenLinks.value } })
    notice.value = 'SiteHealth Checkup queued. The automation worker will assemble a draft SiteHealth Review.'
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The SiteHealth Checkup could not be queued.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack">
    <AppPanel title="Run a SiteHealth Checkup" description="Manual Checkups are available for every site regardless of plan. Plus and Pro annual eligibility is managed separately.">
      <div class="stack">
        <AppCheckbox
          v-model="includeBrokenLinks"
          name="include-broken-links"
          label="Check same-site homepage links"
          description="Optional and bounded to 25 same-site links. Redirects are followed."
        />
        <div class="cluster">
          <AppButton :loading="busy" @click="runCheckup">Run SiteHealth Checkup</AppButton>
          <AppButton :disabled="busy" variant="secondary" @click="refresh">Refresh status</AppButton>
        </div>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      </div>
    </AppPanel>

    <AppPanel title="Annual automation" description="SiteCare Plus and Pro receive one automated Checkup per year; the first is due within 30 days of eligibility.">
      <div v-if="overview?.annualPolicy" class="grid">
        <AppCard muted>
          <p class="text-meta">Automation</p>
          <AppBadge :tone="overview.annualPolicy.enabled ? 'success' : 'neutral'">{{ overview.annualPolicy.enabled ? 'Enabled' : 'Not entitled or paused' }}</AppBadge>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Next due</p>
          <h3>{{ overview.annualPolicy.nextDueAt ? new Date(overview.annualPolicy.nextDueAt).toLocaleDateString() : 'Not scheduled' }}</h3>
        </AppCard>
        <AppCard muted>
          <p class="text-meta">Last completed</p>
          <h3>{{ overview.annualPolicy.lastCompletedAt ? new Date(overview.annualPolicy.lastCompletedAt).toLocaleDateString() : 'Not yet' }}</h3>
        </AppCard>
      </div>
      <AppEmptyState v-else title="Policy initializes automatically" description="The automation worker will synchronize annual eligibility from the central entitlement service." />
    </AppPanel>

    <AppPanel title="SiteHealth Checkups" :description="`${overview?.checkups?.length ?? 0} recent Checkups`">
      <AppTable v-if="overview?.checkups?.length" caption="SiteHealth Checkup history" :columns="['Started', 'Trigger', 'Status', 'Review', '']">
        <tr v-for="checkup in overview.checkups" :key="checkup.id">
          <td>{{ new Date(checkup.createdAt).toLocaleString() }}</td>
          <td>{{ checkup.triggerType }}</td>
          <td><AppBadge :tone="tone(checkup.status)">{{ checkup.status }}</AppBadge></td>
          <td>{{ checkup.latestReview ? `v${checkup.latestReview.version} · ${checkup.latestReview.status}` : 'Pending' }}</td>
          <td><AppButton :to="`/sitehealth/checkups/${checkup.id}`" variant="secondary">Open workspace</AppButton></td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No SiteHealth Checkups yet" description="Run the first Checkup to assemble technician-reviewable evidence and recommendations." />
    </AppPanel>
  </div>
</template>

<style scoped>
.notice,
.error { margin: 0; padding: var(--space-3); border-radius: var(--radius-md); }
.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }
</style>
