<script setup lang="ts">
const props = defineProps<{ siteId: string }>()
const api = useSiteCareApi()
const { data: response, refresh } = await useFetch<any>(() => `/api/admin/sites/${props.siteId}/service`)
const { data: planResponse } = await useFetch<any>('/api/admin/service-plans')
const detail = computed(() => response.value?.data)
const plans = computed(() => planResponse.value?.data ?? [])
const targetPlanId = ref('')
const effectiveAt = ref('')
const changeReason = ref('')
const preview = ref<any>(null)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

const overrideType = ref('service-exception')
const overrideCapability = ref('uptime-monitoring')
const overrideValue = ref('true')
const overrideReason = ref('')
const overrideStartsAt = ref('')
const overrideExpiresAt = ref('')
const editingOverrideId = ref<string | null>(null)
const removalReason = ref('')

const capabilities = [
  { label: 'WordPress update monitoring', value: 'wordpress-update-monitoring' },
  { label: 'Hostinger daily backups', value: 'hostinger-daily-backups' },
  { label: 'Uptime monitoring', value: 'uptime-monitoring' },
  { label: 'Annual SiteHealth Checkup', value: 'annual-sitehealth-checkup' },
  { label: 'Long-term backups', value: 'long-term-backups' }
]

watch(overrideType, (value: string) => {
  if (value === 'service-exception') overrideValue.value = 'true'
  else if (value === 'uptime-interval-minutes') overrideValue.value = '5'
  else if (value === 'uptime-alert-threshold') overrideValue.value = '2'
  else overrideValue.value = 'monthly'
})

async function previewAction(action: 'change-plan' | 'cancel-service' | 'cancel-pending-change') {
  await runAction(async () => {
    preview.value = (await api<any>(`/api/admin/sites/${props.siteId}/service/preview`, {
      method: 'POST',
      body: transitionBody(action, false)
    })).data
    notice.value = 'Review the change below before confirming it.'
  })
}

async function confirmChange() {
  if (!preview.value) return
  await runAction(async () => {
    await api(`/api/admin/sites/${props.siteId}/service/transitions`, {
      method: 'POST',
      body: {
        action: preview.value.action,
        targetPlanId: preview.value.action === 'change-plan' ? preview.value.toPlanId : undefined,
        effectiveAt: preview.value.immediate || preview.value.action === 'cancel-pending-change'
          ? undefined
          : preview.value.effectiveAt,
        reason: changeReason.value
      }
    })
    notice.value = preview.value.immediate ? 'Plan change applied.' : 'Plan change scheduled.'
    preview.value = null
    changeReason.value = ''
    effectiveAt.value = ''
    targetPlanId.value = ''
    await refresh()
  })
}

function transitionBody(action: string, includeReason: boolean) {
  return {
    action,
    targetPlanId: action === 'change-plan' ? targetPlanId.value : undefined,
    effectiveAt: action === 'cancel-pending-change' ? undefined : optionalTimestamp(effectiveAt.value),
    ...(includeReason ? { reason: changeReason.value } : {})
  }
}

async function saveOverride() {
  await runAction(async () => {
    const body = {
      overrideType: overrideType.value,
      capability: overrideType.value === 'service-exception' ? overrideCapability.value : null,
      value: normalizedOverrideValue(),
      reason: overrideReason.value,
      startsAt: optionalTimestamp(overrideStartsAt.value),
      expiresAt: optionalTimestamp(overrideExpiresAt.value)
    }
    if (editingOverrideId.value) {
      await api(`/api/admin/sites/${props.siteId}/service/overrides/${editingOverrideId.value}`, {
        method: 'PATCH',
        body
      })
      notice.value = 'Administrative override updated.'
    } else {
      await api(`/api/admin/sites/${props.siteId}/service/overrides`, { method: 'POST', body })
      notice.value = 'Administrative override created.'
    }
    resetOverrideForm()
    await refresh()
  })
}

function editOverride(item: any) {
  editingOverrideId.value = item.id
  overrideType.value = item.overrideType
  overrideCapability.value = item.capability ?? 'uptime-monitoring'
  overrideValue.value = String(item.value)
  overrideReason.value = item.reason
  overrideStartsAt.value = toLocalInput(item.startsAt)
  overrideExpiresAt.value = item.expiresAt ? toLocalInput(item.expiresAt) : ''
}

async function removeOverride(overrideId: string) {
  await runAction(async () => {
    await api(`/api/admin/sites/${props.siteId}/service/overrides/${overrideId}`, {
      method: 'DELETE',
      body: { reason: removalReason.value }
    })
    removalReason.value = ''
    notice.value = 'Administrative override removed.'
    await refresh()
  })
}

function normalizedOverrideValue(): boolean | number | string {
  if (overrideType.value === 'service-exception') return overrideValue.value === 'true'
  if (overrideType.value === 'long-term-backup-frequency') return overrideValue.value
  return Number(overrideValue.value)
}

function resetOverrideForm() {
  editingOverrideId.value = null
  overrideType.value = 'service-exception'
  overrideCapability.value = 'uptime-monitoring'
  overrideValue.value = 'true'
  overrideReason.value = ''
  overrideStartsAt.value = ''
  overrideExpiresAt.value = ''
}

function optionalTimestamp(value: string): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid date and time.')
  return parsed.toISOString()
}

function toLocalInput(value: string): string {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Not set'
}

function capabilityLabel(value: string): string {
  return capabilities.find(item => item.value === value)?.label ?? value
}

function overrideStatus(item: any): { label: string, tone: 'success' | 'warning' | 'neutral' } {
  if (item.removedAt) return { label: 'Removed', tone: 'neutral' }
  if (item.expiredAt || (item.expiresAt && new Date(item.expiresAt) <= new Date())) return { label: 'Expired', tone: 'neutral' }
  if (new Date(item.startsAt) > new Date()) return { label: 'Scheduled', tone: 'warning' }
  return { label: 'Active', tone: 'success' }
}

async function runAction(action: () => Promise<void>) {
  busy.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The service-plan action could not be completed.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="detail" class="stack">
    <p v-if="notice" class="service-notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="service-error" role="alert">{{ errorMessage }}</p>

    <div class="grid">
      <AppCard>
        <div class="stack stack--sm">
          <AppBadge :tone="detail.effective.operationalStatus === 'active' ? 'success' : 'warning'">
            {{ detail.effective.operationalStatus }}
          </AppBadge>
          <h2>{{ detail.effective.underlyingPlan.name }}</h2>
          <p class="text-meta">Underlying plan is unchanged by temporary exceptions.</p>
        </div>
      </AppCard>
      <AppCard muted>
        <div class="stack stack--sm">
          <p class="text-meta">Paid through</p>
          <h3>{{ formatDate(detail.subscription.paidThroughAt) }}</h3>
          <p class="text-meta">Annual eligibility: {{ formatDate(detail.subscription.annualCheckupEligibleAt) }}</p>
        </div>
      </AppCard>
      <AppCard muted>
        <div class="stack stack--sm">
          <p class="text-meta">Pending change</p>
          <h3>{{ detail.effective.pendingTransition?.transitionType ?? 'None' }}</h3>
          <p class="text-meta">
            {{ detail.effective.pendingTransition ? formatDate(detail.effective.pendingTransition.effectiveAt) : 'No future plan change is scheduled.' }}
          </p>
        </div>
      </AppCard>
    </div>

    <AppPanel title="Effective entitlements" description="These values are the central decisions later interfaces, workers, APIs, agents, and MCP tools consume.">
      <div class="entitlement-grid">
        <div v-for="(label, capability) in Object.fromEntries(capabilities.map(item => [item.value, item.label]))" :key="capability" class="entitlement-row">
          <span>{{ label }}</span>
          <AppBadge :tone="detail.effective.capabilities[capability] ? 'success' : 'neutral'">
            {{ detail.effective.capabilities[capability] ? 'Included' : 'Not included' }}
          </AppBadge>
        </div>
      </div>
      <div class="settings-grid">
        <p><span>Uptime interval</span><strong>{{ detail.effective.settings.uptimeIntervalMinutes ? `${detail.effective.settings.uptimeIntervalMinutes} minutes` : 'N/A' }}</strong></p>
        <p><span>Alert threshold</span><strong>{{ detail.effective.settings.uptimeAlertFailureThreshold ?? 'N/A' }}</strong></p>
        <p><span>Annual Checkups</span><strong>{{ detail.effective.settings.annualSiteHealthCheckups }}</strong></p>
        <p><span>Long-term schedule</span><strong>{{ detail.effective.settings.longTermBackupFrequency ?? 'N/A' }}</strong></p>
        <p><span>Long-term retention</span><strong>{{ detail.effective.settings.longTermBackupRetentionMonths ? `${detail.effective.settings.longTermBackupRetentionMonths} months` : 'N/A' }}</strong></p>
      </div>
    </AppPanel>

    <AppPanel title="Plan lifecycle" description="Preview every plan change before confirming it. Downgrades and cancellations require the paid-period end date.">
      <div class="stack">
        <div class="grid">
          <AppSelect
            v-model="targetPlanId"
            label="Target plan"
            name="target-plan"
            :options="[
              { label: 'Choose a plan', value: '' },
              ...plans.filter((plan: any) => plan.id !== detail.effective.underlyingPlan.id).map((plan: any) => ({ label: plan.name, value: plan.id }))
            ]"
          />
          <AppInput v-model="effectiveAt" label="Paid-period end" name="effective-at" type="datetime-local" description="Required for a downgrade or cancellation." />
          <AppInput v-model="changeReason" label="Plan-change reason" name="change-reason" description="Required when the change is confirmed." />
        </div>
        <div class="cluster">
          <AppButton variant="secondary" :disabled="!targetPlanId || busy" @click="previewAction('change-plan')">Preview plan change</AppButton>
          <AppButton variant="danger" :disabled="busy" @click="previewAction('cancel-service')">Preview cancellation</AppButton>
          <AppButton
            v-if="detail.effective.pendingTransition"
            variant="quiet"
            :disabled="busy"
            @click="previewAction('cancel-pending-change')"
          >
            Preview removal of pending change
          </AppButton>
        </div>
        <AppCard v-if="preview" muted>
          <div class="stack stack--sm">
            <AppBadge :tone="preview.immediate ? 'warning' : 'info'">{{ preview.immediate ? 'Immediate' : 'Scheduled' }}</AppBadge>
            <h3>Confirm {{ preview.transitionType }}</h3>
            <p>{{ preview.summary }}</p>
            <p v-if="preview.gainedCapabilities.length" class="text-meta">Gains: {{ preview.gainedCapabilities.map(capabilityLabel).join(', ') }}</p>
            <p v-if="preview.lostCapabilities.length" class="text-meta">Ends: {{ preview.lostCapabilities.map(capabilityLabel).join(', ') }}</p>
            <div class="cluster">
              <AppButton :loading="busy" :disabled="changeReason.trim().length < 3" @click="confirmChange">Confirm change</AppButton>
              <AppButton variant="quiet" @click="preview = null">Discard preview</AppButton>
            </div>
          </div>
        </AppCard>
      </div>
    </AppPanel>

    <AppPanel title="Administrative overrides" description="Exceptions alter effective behavior without rewriting the underlying plan. Start, change, expiry, and removal are audited.">
      <form class="stack" @submit.prevent="saveOverride">
        <div class="grid">
          <AppSelect
            v-model="overrideType"
            label="Override type"
            name="override-type"
            :options="[
              { label: 'Service exception', value: 'service-exception' },
              { label: 'Uptime interval (minutes)', value: 'uptime-interval-minutes' },
              { label: 'Uptime alert threshold', value: 'uptime-alert-threshold' },
              { label: 'Long-term backup frequency', value: 'long-term-backup-frequency' }
            ]"
          />
          <AppSelect
            v-if="overrideType === 'service-exception'"
            v-model="overrideCapability"
            label="Capability"
            name="override-capability"
            :options="capabilities"
          />
          <AppSelect
            v-if="overrideType === 'service-exception'"
            v-model="overrideValue"
            label="Exception value"
            name="override-value-boolean"
            :options="[{ label: 'Enable', value: 'true' }, { label: 'Disable', value: 'false' }]"
          />
          <AppSelect
            v-else-if="overrideType === 'long-term-backup-frequency'"
            v-model="overrideValue"
            label="Backup frequency"
            name="override-value-frequency"
            :options="[{ label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' }]"
          />
          <AppInput v-else v-model="overrideValue" label="Value" name="override-value" type="number" />
          <AppInput v-model="overrideStartsAt" label="Starts at" name="override-starts" type="datetime-local" description="Leave blank to start now." />
          <AppInput v-model="overrideExpiresAt" label="Expires at" name="override-expires" type="datetime-local" description="Optional; otherwise remove it manually." />
        </div>
        <AppInput v-model="overrideReason" label="Override reason" name="override-reason" />
        <div class="cluster">
          <AppButton type="submit" :loading="busy" :disabled="overrideReason.trim().length < 3">
            {{ editingOverrideId ? 'Save override changes' : 'Create override' }}
          </AppButton>
          <AppButton v-if="editingOverrideId" variant="quiet" @click="resetOverrideForm">Cancel editing</AppButton>
        </div>
      </form>

      <div v-if="detail.overrides.length" class="stack override-list">
        <AppInput v-model="removalReason" label="Removal reason" name="override-removal-reason" description="Required before removing an active override." />
        <AppCard v-for="item in detail.overrides" :key="item.id" muted>
          <div class="stack stack--sm">
            <div class="cluster">
              <AppBadge :tone="overrideStatus(item).tone">{{ overrideStatus(item).label }}</AppBadge>
              <strong>{{ item.overrideType }}</strong>
            </div>
            <p>{{ item.capability ? `${capabilityLabel(item.capability)}: ` : '' }}{{ item.value }}</p>
            <p class="text-meta">{{ item.reason }} · {{ formatDate(item.startsAt) }} to {{ formatDate(item.expiresAt) }}</p>
            <div v-if="overrideStatus(item).label === 'Active' || overrideStatus(item).label === 'Scheduled'" class="cluster">
              <AppButton variant="secondary" @click="editOverride(item)">Edit</AppButton>
              <AppButton variant="danger" :disabled="removalReason.trim().length < 3 || busy" @click="removeOverride(item.id)">Remove</AppButton>
            </div>
          </div>
        </AppCard>
      </div>
      <AppEmptyState v-else title="No administrative overrides" description="This site currently follows its plan without exceptions." />
    </AppPanel>

    <AppPanel title="Plan history" description="Applied, scheduled, and cancelled lifecycle events remain inspectable.">
      <div v-if="detail.transitions.length" class="history-list">
        <article v-for="item in detail.transitions" :key="item.id">
          <div class="cluster">
            <AppBadge :tone="item.status === 'applied' ? 'success' : item.status === 'scheduled' ? 'warning' : 'neutral'">{{ item.status }}</AppBadge>
            <strong>{{ item.transitionType }}</strong>
          </div>
          <p class="text-meta">{{ item.fromPlanId ?? 'None' }} → {{ item.toPlanId ?? 'Cancelled service' }} · effective {{ formatDate(item.effectiveAt) }}</p>
          <p>{{ item.reason }}</p>
        </article>
      </div>
    </AppPanel>
  </div>
</template>

<style scoped>
.service-notice,
.service-error {
  margin-bottom: var(--space-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.service-notice { background: var(--color-info-soft); color: var(--color-info); }
.service-error { background: var(--color-danger-soft); color: var(--color-danger); }

.entitlement-grid,
.history-list {
  display: grid;
  gap: var(--space-3);
}

.entitlement-row,
.history-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-bottom: var(--border-default);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.settings-grid p {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  color: var(--color-text-muted);
}

.settings-grid strong { color: var(--color-text); }
.override-list { margin-top: var(--space-6); }
.history-list article { display: grid; justify-content: stretch; }
</style>
