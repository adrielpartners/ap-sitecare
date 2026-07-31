<script setup lang="ts">
type JobStatus = 'queued' | 'preflight' | 'running' | 'verifying' | 'succeeded' | 'failed' | 'needs-attention' | 'cancelled'

interface AutomationJob {
  id: string
  siteId: string | null
  jobType: string
  operationKey: string
  status: JobStatus
  attemptCount: number
  maxAttempts: number
  availableAt: string
  leaseOwner: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

interface AutomationAttempt {
  id: string
  attemptNumber: number
  workerId: string
  status: string
  startedAt: string
  completedAt: string | null
  errorMessage: string | null
}

interface AutomationSchedule {
  id: string
  siteId: string | null
  name: string
  jobType: string
  intervalSeconds: number
  enabled: boolean
  nextRunAt: string
  lastEnqueuedAt: string | null
}

const api = useSiteCareApi()
const statusFilter = ref('')
const selectedId = ref('')
const selected = ref<{ job: AutomationJob, attempts: AutomationAttempt[] } | null>(null)
const busyId = ref('')
const notice = ref('')
const errorMessage = ref('')

const jobsUrl = computed(() => statusFilter.value
  ? `/api/admin/automation/jobs?status=${encodeURIComponent(statusFilter.value)}&limit=200`
  : '/api/admin/automation/jobs?limit=200')
const { data: jobsResponse, refresh: refreshJobs } = await useFetch<any>(jobsUrl)
const { data: schedulesResponse, refresh: refreshSchedules } = await useFetch<any>('/api/admin/automation/schedules')
const jobs = computed<AutomationJob[]>(() => jobsResponse.value?.data ?? [])
const schedules = computed<AutomationSchedule[]>(() => schedulesResponse.value?.data ?? [])
const activeCount = computed(() => jobs.value.filter((job: AutomationJob) => ['preflight', 'running', 'verifying'].includes(job.status)).length)
const queuedCount = computed(() => jobs.value.filter((job: AutomationJob) => job.status === 'queued').length)
const attentionCount = computed(() => jobs.value.filter((job: AutomationJob) => ['failed', 'needs-attention'].includes(job.status)).length)

watch(statusFilter, async () => {
  selectedId.value = ''
  selected.value = null
  await refreshJobs()
})

function dateTime(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function intervalLabel(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

function statusTone(status: JobStatus | string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'needs-attention') return 'warning'
  if (['preflight', 'running', 'verifying'].includes(status)) return 'info'
  return 'neutral'
}

async function inspect(jobId: string) {
  selectedId.value = jobId
  errorMessage.value = ''
  try {
    const response = await api<any>(`/api/admin/automation/jobs/${jobId}`)
    selected.value = response.data
  } catch (error) {
    errorMessage.value = requestError(error, 'The job detail could not be loaded.')
  }
}

async function jobAction(job: AutomationJob, action: 'cancel' | 'retry') {
  busyId.value = job.id
  notice.value = ''
  errorMessage.value = ''
  try {
    await api(`/api/admin/automation/jobs/${job.id}/${action}`, {
      method: 'POST',
      body: action === 'retry' ? { additionalAttempts: 3 } : undefined
    })
    notice.value = action === 'retry' ? 'The job was queued for another attempt.' : 'Cancellation was recorded.'
    await Promise.all([refreshJobs(), refreshSchedules()])
    await inspect(job.id)
  } catch (error) {
    errorMessage.value = requestError(error, `The job could not be ${action === 'retry' ? 'retried' : 'cancelled'}.`)
  } finally {
    busyId.value = ''
  }
}

function requestError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const value = error as { data?: { statusMessage?: unknown, message?: unknown }, statusMessage?: unknown, message?: unknown }
  const message = value.data?.statusMessage ?? value.data?.message ?? value.statusMessage ?? value.message
  return typeof message === 'string' ? message : fallback
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Operations</p>
      <h1>Automation</h1>
      <p>Inspect scheduled work, durable attempts, worker leases, retries, and jobs requiring attention.</p>
    </header>

    <div class="stack">
      <div class="grid">
        <AppStatCard label="Active leases" :value="activeCount" description="Workers in preflight, execution, or verification." tone="info" />
        <AppStatCard label="Queued work" :value="queuedCount" description="Durable jobs waiting for their claim time." tone="warning" />
        <AppStatCard label="Needs review" :value="attentionCount" description="Failed jobs or work requiring technician attention." tone="danger" />
      </div>

      <p v-if="notice" class="automation-message automation-message--notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="automation-message automation-message--error" role="alert">{{ errorMessage }}</p>

      <AppPanel title="Durable schedules" description="Schedules are persisted in PostgreSQL. The worker advances each due time only after the job is durably queued.">
        <AppTable v-if="schedules.length" caption="Automation schedules" :columns="['Schedule', 'Scope', 'Interval', 'Last queued', 'Next run', 'Status']">
          <tr v-for="schedule in schedules" :key="schedule.id">
            <td><strong>{{ schedule.name }}</strong><br><span class="text-meta">{{ schedule.jobType }}</span></td>
            <td>{{ schedule.siteId ? `Site · ${schedule.siteId.slice(0, 8)}` : 'System' }}</td>
            <td>{{ intervalLabel(schedule.intervalSeconds) }}</td>
            <td>{{ dateTime(schedule.lastEnqueuedAt) }}</td>
            <td>{{ dateTime(schedule.nextRunAt) }}</td>
            <td><AppBadge :tone="schedule.enabled ? 'success' : 'neutral'">{{ schedule.enabled ? 'Enabled' : 'Paused' }}</AppBadge></td>
          </tr>
        </AppTable>
        <AppEmptyState v-else title="No durable schedules" description="Schedules appear here as later phases register recurring work." />
      </AppPanel>

      <AppPanel title="Job history" description="A provider accepting a request is recorded separately from successful verification.">
        <div class="automation-filter">
          <AppSelect v-model="statusFilter" label="Filter by status" name="automation-status" :options="[
            { label: 'All statuses', value: '' },
            { label: 'Queued', value: 'queued' },
            { label: 'Running', value: 'running' },
            { label: 'Succeeded', value: 'succeeded' },
            { label: 'Needs attention', value: 'needs-attention' },
            { label: 'Failed', value: 'failed' },
            { label: 'Cancelled', value: 'cancelled' }
          ]" />
        </div>
        <AppTable v-if="jobs.length" caption="Automation job history" :columns="['Work', 'Scope', 'Status', 'Attempts', 'Updated', 'Controls']">
          <tr v-for="job in jobs" :key="job.id" :class="{ 'automation-row--selected': selectedId === job.id }">
            <td><strong>{{ job.jobType }}</strong><br><span class="text-meta">{{ job.operationKey }}</span></td>
            <td>{{ job.siteId ? `Site · ${job.siteId.slice(0, 8)}` : 'System' }}</td>
            <td><AppBadge :tone="statusTone(job.status)">{{ job.status }}</AppBadge></td>
            <td>{{ job.attemptCount }} / {{ job.maxAttempts }}</td>
            <td>{{ dateTime(job.updatedAt) }}</td>
            <td>
              <div class="cluster">
                <AppButton variant="quiet" @click="inspect(job.id)">Inspect</AppButton>
                <AppButton
                  v-if="['queued', 'preflight', 'running', 'verifying'].includes(job.status)"
                  variant="danger"
                  :loading="busyId === job.id"
                  @click="jobAction(job, 'cancel')"
                >Cancel</AppButton>
                <AppButton
                  v-if="['failed', 'needs-attention'].includes(job.status)"
                  variant="secondary"
                  :loading="busyId === job.id"
                  @click="jobAction(job, 'retry')"
                >Retry</AppButton>
              </div>
            </td>
          </tr>
        </AppTable>
        <AppEmptyState v-else title="No matching jobs" description="Durable work will appear here after it is queued." />
      </AppPanel>

      <AppPanel v-if="selected" title="Job detail" :description="`Job ${selected.job.id}`">
        <div class="grid">
          <AppCard muted>
            <div class="stack stack--sm">
              <AppBadge :tone="statusTone(selected.job.status)">{{ selected.job.status }}</AppBadge>
              <h3>{{ selected.job.jobType }}</h3>
              <p class="text-meta">Requested {{ dateTime(selected.job.createdAt) }}</p>
              <p v-if="selected.job.leaseOwner" class="text-meta">Lease owner: {{ selected.job.leaseOwner }}</p>
              <p v-if="selected.job.errorMessage" class="automation-error-detail">{{ selected.job.errorMessage }}</p>
            </div>
          </AppCard>
          <AppCard muted>
            <div class="stack stack--sm">
              <p class="eyebrow">Attempts</p>
              <h3>{{ selected.attempts.length }} recorded</h3>
              <p class="text-meta">Each attempt retains its worker, state, timing, and safe error summary.</p>
            </div>
          </AppCard>
        </div>
        <AppTable v-if="selected.attempts.length" caption="Job attempts" :columns="['Attempt', 'Worker', 'Status', 'Started', 'Completed', 'Result']">
          <tr v-for="attempt in selected.attempts" :key="attempt.id">
            <td>#{{ attempt.attemptNumber }}</td>
            <td>{{ attempt.workerId }}</td>
            <td><AppBadge :tone="statusTone(attempt.status)">{{ attempt.status }}</AppBadge></td>
            <td>{{ dateTime(attempt.startedAt) }}</td>
            <td>{{ dateTime(attempt.completedAt) }}</td>
            <td>{{ attempt.errorMessage ?? 'No error' }}</td>
          </tr>
        </AppTable>
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.automation-filter {
  max-width: 18rem;
  margin-bottom: var(--space-4);
}

.automation-message,
.automation-error-detail {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.automation-message--notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.automation-message--error,
.automation-error-detail {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.automation-row--selected td {
  background: var(--gradient-selected);
}
</style>
