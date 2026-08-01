<script setup lang="ts">
useHead({ title: 'SiteHealth Checkup Workspace' })
const route = useRoute()
const api = useSiteCareApi()
const checkupId = computed(() => String(route.params.id))
const { data: response, refresh } = await useFetch<any>(() => `/api/sitehealth/checkups/${checkupId.value}`)
const detail = computed(() => response.value?.data)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const finding = reactive({ id: '', area: 'content', severity: 'low', title: '', description: '', status: 'active', technicianNotes: '' })
const recommendation = reactive({ id: '', area: 'content', actionType: 'manual-maintenance', priority: 'low', title: '', description: '', status: 'proposed' })
const draftTitle = ref('')
const draftSummary = ref('')
const approvalReviewId = ref('')
const approvalStatus = ref('approved-all')
const approvalSource = ref('external-email')
const approvalNotes = ref('')
const areas = ['performance', 'content', 'media', 'users', 'plugins-themes', 'environment', 'database', 'backups', 'updates']
const actions = [
  'remove-unused-plugin', 'remove-unused-theme', 'remove-unused-user', 'optimize-database',
  'clear-revisions', 'clear-expired-transients', 'compress-images', 'review-orphaned-media',
  'verify-backups', 'verify-updates', 'manual-maintenance'
]
const draft = computed(() => detail.value?.reviews?.find((item: any) => item.status === 'draft'))
const published = computed(() => detail.value?.reviews?.filter((item: any) => ['published', 'sent', 'superseded'].includes(item.status)) ?? [])

watch(draft, (value: any) => {
  if (value) {
    draftTitle.value = value.title
    draftSummary.value = value.executiveSummary
  }
}, { immediate: true })
watch(published, (value: any[]) => {
  const current = value.find((item: any) => ['published', 'sent'].includes(item.status))
  if (current && !approvalReviewId.value) approvalReviewId.value = current.id
}, { immediate: true })

function tone(status: string) {
  return ({ 'draft-ready': 'success', running: 'info', queued: 'warning', failed: 'danger', available: 'success', unavailable: 'neutral', error: 'danger', active: 'success', dismissed: 'neutral', proposed: 'warning', approved: 'success', initiated: 'info', sent: 'success', published: 'success', superseded: 'neutral' } as const)[status as 'active'] ?? 'neutral'
}

async function runAction(action: () => Promise<void>, success: string) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
    notice.value = success
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The action could not be completed.'
  } finally {
    busy.value = false
  }
}

function editFinding(item: any) {
  Object.assign(finding, { id: item.id, area: item.area, severity: item.severity, title: item.title, description: item.description, status: item.status, technicianNotes: item.technicianNotes ?? '' })
}
function resetFinding() { Object.assign(finding, { id: '', area: 'content', severity: 'low', title: '', description: '', status: 'active', technicianNotes: '' }) }
async function saveFinding() {
  await runAction(async () => {
    await api(`/api/sitehealth/checkups/${checkupId.value}/findings`, { method: 'PUT', body: finding })
    resetFinding()
  }, 'Finding saved and the draft Review refreshed.')
}

function editRecommendation(item: any) {
  Object.assign(recommendation, { id: item.id, area: item.area, actionType: item.actionType, priority: item.priority, title: item.title, description: item.description, status: item.status })
}
function resetRecommendation() { Object.assign(recommendation, { id: '', area: 'content', actionType: 'manual-maintenance', priority: 'low', title: '', description: '', status: 'proposed' }) }
async function saveRecommendation() {
  await runAction(async () => {
    await api(`/api/sitehealth/checkups/${checkupId.value}/recommendations`, { method: 'PUT', body: recommendation })
    resetRecommendation()
  }, 'Recommendation saved and the draft Review refreshed.')
}

async function saveDraft() {
  await runAction(() => api(`/api/sitehealth/checkups/${checkupId.value}/draft`, { method: 'PATCH', body: { title: draftTitle.value, executiveSummary: draftSummary.value } }), 'Draft SiteHealth Review saved.')
}
async function publishReview() {
  await runAction(() => api(`/api/sitehealth/checkups/${checkupId.value}/publish`, { method: 'POST' }), 'A new immutable SiteHealth Review version was published.')
}
async function sendReview(reviewId: string) {
  await runAction(() => api(`/api/sitehealth/reviews/${reviewId}/send`, { method: 'POST' }), 'SiteHealth Review email queued for the site’s configured recipients.')
}
async function recordApproval() {
  await runAction(() => api(`/api/sitehealth/reviews/${approvalReviewId.value}/approval`, { method: 'POST', body: { status: approvalStatus.value, source: approvalSource.value, notes: approvalNotes.value } }), 'External client response recorded. Approved cleanup items remain technician-initiated only.')
}
async function initiateCleanup(proposalId: string) {
  await runAction(() => api(`/api/sitehealth/cleanup/${proposalId}/initiate`, { method: 'POST', body: { notes: 'Technician initiated approved cleanup planning. No automated executor is attached.' } }), 'Approved cleanup item marked initiated. The Dashboard did not execute any cleanup.')
}
</script>

<template>
  <div v-if="detail">
    <header class="page-heading">
      <p class="eyebrow">SiteHealth Checkup</p>
      <h1>Technician review workspace</h1>
      <p>Evidence, findings, recommendations, publication, delivery, approval, and the manual cleanup boundary.</p>
    </header>

    <div class="stack">
      <div class="cluster">
        <AppBadge :tone="tone(detail.checkup.status)">{{ detail.checkup.status }}</AppBadge>
        <span class="text-meta">{{ detail.checkup.triggerType }} · {{ formatSiteCareDateTime(detail.checkup.createdAt) }}</span>
        <AppButton variant="secondary" :disabled="busy" @click="refresh">Refresh</AppButton>
      </div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

      <AppPanel v-if="detail.checkup.status !== 'draft-ready'" title="Collection in progress" description="The durable automation worker gathers Dashboard and WordPress evidence, then assembles a draft Review.">
        <p v-if="detail.checkup.errorMessage" class="error">{{ detail.checkup.errorMessage }}</p>
        <p v-else class="text-meta">Queued and running Checkups can be refreshed here. Failed worker attempts follow the normal automation retry policy.</p>
      </AppPanel>

      <template v-else>
        <AppPanel title="Evidence" :description="`${detail.evidence.length} normalized evidence records; unavailable data is preserved explicitly.`">
          <div class="grid">
            <AppCard v-for="item in detail.evidence" :key="item.id" muted>
              <div class="stack stack--sm">
                <div class="cluster"><AppBadge :tone="tone(item.availability)">{{ item.availability }}</AppBadge><span class="text-meta">{{ item.area }}</span></div>
                <h3>{{ item.metricKey }}</h3>
                <p>{{ item.summary }}</p>
                <p class="text-meta">{{ item.source }} · {{ item.observedAt ? formatSiteCareDateTime(item.observedAt) : 'not observed' }}</p>
              </div>
            </AppCard>
          </div>
        </AppPanel>

        <AppPanel title="Findings" description="Technicians may revise automated findings or add manual findings. Source evidence remains linked.">
          <AppTable v-if="detail.findings.length" caption="SiteHealth findings" :columns="['Area', 'Severity', 'Finding', 'Status', '']">
            <tr v-for="item in detail.findings" :key="item.id">
              <td>{{ item.area }}</td><td><AppBadge :tone="item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'neutral'">{{ item.severity }}</AppBadge></td>
              <td><strong>{{ item.title }}</strong><br><span class="text-meta">{{ item.description }}</span></td>
              <td><AppBadge :tone="tone(item.status)">{{ item.status }}</AppBadge></td>
              <td><AppButton variant="secondary" @click="editFinding(item)">Edit</AppButton></td>
            </tr>
          </AppTable>
          <form class="stack" @submit.prevent="saveFinding">
            <div class="grid">
              <AppSelect v-model="finding.area" name="finding-area" label="Area" :options="areas.map(value => ({ label: value, value }))" />
              <AppSelect v-model="finding.severity" name="finding-severity" label="Severity" :options="['info', 'low', 'medium', 'high'].map(value => ({ label: value, value }))" />
              <AppSelect v-model="finding.status" name="finding-status" label="Status" :options="[{ label: 'Active', value: 'active' }, { label: 'Dismissed', value: 'dismissed' }]" />
            </div>
            <AppInput v-model="finding.title" name="finding-title" label="Finding title" />
            <AppTextarea v-model="finding.description" name="finding-description" label="Description" />
            <AppTextarea v-model="finding.technicianNotes" name="finding-notes" label="Technician notes" />
            <div class="cluster"><AppButton type="submit" :loading="busy">{{ finding.id ? 'Update finding' : 'Add finding' }}</AppButton><AppButton variant="quiet" @click="resetFinding">Clear</AppButton></div>
          </form>
        </AppPanel>

        <AppPanel title="Recommendations" description="Recommendations describe proposed work only. Nothing in this phase executes cleanup.">
          <AppTable v-if="detail.recommendations.length" caption="SiteHealth recommendations" :columns="['Priority', 'Recommendation', 'Action', 'Status', '']">
            <tr v-for="item in detail.recommendations" :key="item.id">
              <td><AppBadge :tone="item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'neutral'">{{ item.priority }}</AppBadge></td>
              <td><strong>{{ item.title }}</strong><br><span class="text-meta">{{ item.description }}</span></td><td>{{ item.actionType }}</td>
              <td><AppBadge :tone="tone(item.status)">{{ item.status }}</AppBadge></td><td><AppButton variant="secondary" @click="editRecommendation(item)">Edit</AppButton></td>
            </tr>
          </AppTable>
          <form class="stack" @submit.prevent="saveRecommendation">
            <div class="grid">
              <AppSelect v-model="recommendation.area" name="recommendation-area" label="Area" :options="areas.map(value => ({ label: value, value }))" />
              <AppSelect v-model="recommendation.actionType" name="recommendation-action" label="Action type" :options="actions.map(value => ({ label: value, value }))" />
              <AppSelect v-model="recommendation.priority" name="recommendation-priority" label="Priority" :options="['low', 'medium', 'high'].map(value => ({ label: value, value }))" />
              <AppSelect v-model="recommendation.status" name="recommendation-status" label="Status" :options="[{ label: 'Proposed', value: 'proposed' }, { label: 'Dismissed', value: 'dismissed' }]" />
            </div>
            <AppInput v-model="recommendation.title" name="recommendation-title" label="Recommendation title" />
            <AppTextarea v-model="recommendation.description" name="recommendation-description" label="Description" />
            <div class="cluster"><AppButton type="submit" :loading="busy">{{ recommendation.id ? 'Update recommendation' : 'Add recommendation' }}</AppButton><AppButton variant="quiet" @click="resetRecommendation">Clear</AppButton></div>
          </form>
        </AppPanel>

        <AppPanel title="Draft SiteHealth Review" description="Edit the client-facing title and executive summary, then publish an immutable version.">
          <form class="stack" @submit.prevent="saveDraft">
            <AppInput v-model="draftTitle" name="review-title" label="Review title" />
            <AppTextarea v-model="draftSummary" name="review-summary" label="Executive summary" />
            <div class="cluster"><AppButton type="submit" :loading="busy">Save draft</AppButton><AppButton :disabled="busy" variant="secondary" @click="publishReview">Publish new version</AppButton></div>
          </form>
        </AppPanel>

        <AppPanel title="Published Reviews and delivery" description="The Dashboard generates and queues email to all enabled per-site SiteHealth recipients.">
          <AppTable v-if="published.length" caption="Published SiteHealth Review versions" :columns="['Version', 'Status', 'Published', 'Actions']">
            <tr v-for="review in published" :key="review.id">
              <td>v{{ review.version }}</td><td><AppBadge :tone="tone(review.status)">{{ review.status }}</AppBadge></td>
              <td>{{ review.publishedAt ? formatSiteCareDateTime(review.publishedAt) : '—' }}</td>
              <td><div class="cluster"><AppButton :to="`/reports/${review.id}`" variant="secondary">View</AppButton><AppButton v-if="review.status !== 'superseded'" :loading="busy" @click="sendReview(review.id)">Email Review</AppButton></div></td>
            </tr>
          </AppTable>
          <AppEmptyState v-else title="Not published" description="Review the evidence and recommendations, then publish the first version." />
        </AppPanel>

        <AppPanel title="Record external client approval" description="Email replies are not interpreted automatically. A technician records the client response here.">
          <form class="stack" @submit.prevent="recordApproval">
            <AppSelect v-model="approvalReviewId" name="approval-review" label="Published Review" :options="published.filter((item: any) => item.status !== 'superseded').map((item: any) => ({ label: `Version ${item.version}`, value: item.id }))" />
            <div class="grid">
              <AppSelect v-model="approvalStatus" name="approval-status" label="Response" :options="[{ label: 'Approved all', value: 'approved-all' }, { label: 'Declined', value: 'declined' }, { label: 'Partial / needs follow-up', value: 'partial' }]" />
              <AppSelect v-model="approvalSource" name="approval-source" label="Source" :options="[{ label: 'External email', value: 'external-email' }, { label: 'Phone', value: 'phone' }, { label: 'Other', value: 'other' }]" />
            </div>
            <AppTextarea v-model="approvalNotes" name="approval-notes" label="Technician notes and approval evidence" />
            <AppButton type="submit" :disabled="!approvalReviewId" :loading="busy">Record client response</AppButton>
          </form>
        </AppPanel>

        <AppPanel title="Approved cleanup boundary" description="Approved items can be marked initiated by a technician. There is deliberately no automated cleanup executor.">
          <AppTable v-if="detail.cleanupProposals.length" caption="Cleanup proposals" :columns="['Action', 'Status', 'Approval', '']">
            <tr v-for="proposal in detail.cleanupProposals" :key="proposal.id">
              <td>{{ proposal.actionType }}</td><td><AppBadge :tone="tone(proposal.status)">{{ proposal.status }}</AppBadge></td><td>{{ proposal.approvalId ? 'Recorded' : 'Missing' }}</td>
              <td><AppButton v-if="proposal.status === 'approved'" :loading="busy" variant="secondary" @click="initiateCleanup(proposal.id)">Mark technician initiated</AppButton><span v-else class="text-meta">No automatic action</span></td>
            </tr>
          </AppTable>
          <AppEmptyState v-else title="No approved cleanup work" description="Cleanup proposals appear only after explicit client approval is recorded." />
        </AppPanel>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notice,
.error { margin: 0; padding: var(--space-3); border-radius: var(--radius-md); }
.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }
</style>
