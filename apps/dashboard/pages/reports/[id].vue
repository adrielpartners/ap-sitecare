<script setup lang="ts">
const route = useRoute()
const { data: session } = await useFetch<any>('/api/session')
const isClient = computed(() => session.value?.user?.role === 'client')
const reviewId = computed(() => String(route.params.id))
const endpoint = computed(() => isClient.value
  ? `/api/client/sitehealth/reviews/${reviewId.value}`
  : `/api/sitehealth/reviews/${reviewId.value}`)
const { data: response } = await useFetch<any>(endpoint)
const review = computed(() => response.value?.data)
useHead({ title: computed(() => review.value?.title ?? 'SiteHealth Review') })

function severityTone(severity: string) {
  return severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : severity === 'low' ? 'info' : 'neutral'
}
</script>

<template>
  <article v-if="review" class="review">
    <header class="page-heading">
      <p class="eyebrow">SiteHealth Review · Version {{ review.version }}</p>
      <h1>{{ review.title }}</h1>
      <p>{{ review.content.site.url }}</p>
      <div class="cluster">
        <AppBadge tone="success">{{ review.status }}</AppBadge>
        <span class="text-meta">Published {{ review.publishedAt ? new Date(review.publishedAt).toLocaleDateString() : '—' }}</span>
      </div>
    </header>

    <div class="stack">
      <AppPanel title="Executive summary" description="Prepared and published by your SiteCare team.">
        <p class="review__summary">{{ review.executiveSummary }}</p>
      </AppPanel>

      <AppPanel title="Findings" :description="`${review.content.findings.length} reviewed findings`">
        <div v-if="review.content.findings.length" class="stack">
          <AppCard v-for="finding in review.content.findings" :key="finding.id" muted>
            <div class="stack stack--sm">
              <div class="cluster"><AppBadge :tone="severityTone(finding.severity)">{{ finding.severity }}</AppBadge><span class="text-meta">{{ finding.area }}</span></div>
              <h3>{{ finding.title }}</h3>
              <p>{{ finding.description }}</p>
              <p v-if="finding.technicianNotes" class="text-meta">Technician note: {{ finding.technicianNotes }}</p>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No active findings" description="No maintenance concerns were retained in this published Review." />
      </AppPanel>

      <AppPanel title="Recommendations" description="These are recommendations only; no cleanup has been performed automatically.">
        <div v-if="review.content.recommendations.length" class="stack">
          <AppCard v-for="recommendation in review.content.recommendations" :key="recommendation.id" muted>
            <div class="stack stack--sm">
              <div class="cluster"><AppBadge :tone="severityTone(recommendation.priority)">{{ recommendation.priority }}</AppBadge><span class="text-meta">{{ recommendation.area }}</span></div>
              <h3>{{ recommendation.title }}</h3>
              <p>{{ recommendation.description }}</p>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No maintenance recommendations" description="No cleanup or maintenance work is being proposed in this Review." />
      </AppPanel>

      <AppPanel title="Evidence availability" description="The Review identifies unavailable data rather than estimating or inventing results.">
        <AppTable caption="SiteHealth evidence availability" :columns="['Area', 'Source', 'Status', 'Summary']">
          <tr v-for="item in review.content.evidence" :key="item.id">
            <td>{{ item.area }}</td><td>{{ item.source }}</td>
            <td><AppBadge :tone="item.availability === 'available' ? 'success' : item.availability === 'error' ? 'danger' : 'neutral'">{{ item.availability }}</AppBadge></td>
            <td>{{ item.summary }}</td>
          </tr>
        </AppTable>
      </AppPanel>

      <AppCard tone="warning">
        <div class="stack stack--sm">
          <p class="eyebrow">Approval required</p>
          <h2>Ready to proceed?</h2>
          <p>{{ review.content.approvalInstructions }}</p>
        </div>
      </AppCard>
    </div>
  </article>
</template>

<style scoped>
.review { max-width: 70rem; }
.review__summary { font-size: var(--font-size-lg); line-height: var(--line-height-body); }
</style>
