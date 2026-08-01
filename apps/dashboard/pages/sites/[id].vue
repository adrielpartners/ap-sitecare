<script setup lang="ts">
const route = useRoute()
const api = useSiteCareApi()
const { data: sessionResponse } = await useFetch<any>('/api/session')
const isAdmin = computed(() => sessionResponse.value?.user?.role === 'admin')
const isClient = computed(() => sessionResponse.value?.user?.role === 'client')
const siteId = computed(() => String(route.params.id))
const { data: response, refresh } = await useFetch(() => `/api/sites/${siteId.value}`)
const { data: auditResponse } = await useFetch(() => `/api/sites/${siteId.value}/audit`)
const { data: connectionResponse, refresh: refreshConnection } = await useFetch<any>(() => `/api/sites/${siteId.value}/connection`)
const detail = computed(() => response.value?.data)
const name = ref('')
const url = ref('')
const hostingProvider = ref('')
const backupStrategy = ref('')
const riskLevel = ref('standard')
const notes = ref('')
const issuedSecret = ref('')
const notice = ref('')
const errorMessage = ref('')
const busy = ref(false)
const auditEvents = computed(() => auditResponse.value?.data ?? [])
const connectionDetail = computed(() => connectionResponse.value?.data)
const integrationResults = ref<Record<string, { state: string, summary: string, checkedAt: string }>>({})
const allTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'service', label: 'Service Plan' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'reports', label: 'Reports' },
  { id: 'updates', label: 'Updates' },
  { id: 'uptime', label: 'Uptime' },
  { id: 'security', label: 'Security Status' },
  { id: 'backups', label: 'Backups' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'audit', label: 'Audit Log' }
] as const
type SiteTabId = typeof allTabs[number]['id']
const tabs = computed(() => allTabs.filter((tab: typeof allTabs[number]) =>
  (!['service', 'notifications'].includes(tab.id) || isAdmin.value)
  && (tab.id !== 'reports' || !isClient.value)
))
const requestedTab = String(route.query.tab ?? 'overview') as SiteTabId
const activeTab = ref<SiteTabId>(tabs.value.some((tab: typeof allTabs[number]) => tab.id === requestedTab) ? requestedTab : 'overview')

function setActiveTab(tabId: SiteTabId) {
  activeTab.value = tabId
}

watch(detail, (value: any) => {
  if (value) {
    name.value = value.site.name
    url.value = value.site.url
    hostingProvider.value = value.site.hostingProvider ?? ''
    backupStrategy.value = value.site.backupStrategy ?? ''
    riskLevel.value = value.site.riskLevel
    notes.value = value.site.notes ?? ''
  }
}, { immediate: true })

async function updateSite() {
  await runAction(async () => {
    await api(`/api/sites/${siteId.value}`, {
      method: 'PATCH',
      body: {
        name: name.value,
        url: url.value,
        hostingProvider: hostingProvider.value,
        backupStrategy: backupStrategy.value,
        riskLevel: riskLevel.value,
        notes: notes.value
      }
    })
    notice.value = 'Site details updated.'
    await refresh()
  })
}

async function disableSite() {
  await runAction(async () => {
    await api(`/api/sites/${siteId.value}/disable`, { method: 'POST' })
    notice.value = 'Site disabled.'
    await refresh()
  })
}

async function issueCredential() {
  await runAction(async () => {
    const result = await api<any>(`/api/sites/${siteId.value}/credentials`, { method: 'POST' })
    issuedSecret.value = result.data.secret
    notice.value = 'Credential issued. Save the secret now; it will not be shown again.'
    await refresh()
    await refreshConnection()
  })
}

async function testConnection() {
  await runAction(async () => {
    await refreshConnection()
    notice.value = connectionDetail.value?.message ?? 'Connection status refreshed.'
  })
}

async function revokeConnection() {
  await runAction(async () => {
    await api(`/api/sites/${siteId.value}/connection/revoke`, { method: 'POST' })
    issuedSecret.value = ''
    notice.value = 'The WordPress connection was revoked. Historical reports remain available.'
    await refresh()
    await refreshConnection()
  })
}

async function inspectIntegration(provider: 'cloudflare' | 'dropbox' | 'hostinger') {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${siteId.value}/integrations/${provider}`)
    integrationResults.value[provider] = result.data
    notice.value = result.data.summary
  })
}

async function runAction(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The action could not be completed.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="detail">
    <header class="page-heading">
      <p class="eyebrow">Managed site</p>
      <h1>{{ detail.site.name }}</h1>
      <p>{{ detail.site.url }}</p>
    </header>

    <div class="stack">
      <div class="grid">
        <AppCard>
          <div class="stack stack--sm">
            <AppBadge :tone="detail.site.status === 'active' ? 'success' : 'neutral'">
              {{ detail.site.status }}
            </AppBadge>
            <h2>Inventory status</h2>
            <p class="text-meta">Registered {{ formatSiteCareDateTime(detail.site.createdAt) }}</p>
          </div>
        </AppCard>
        <AppCard>
          <div class="stack stack--sm">
            <AppBadge :tone="connectionDetail?.status === 'connected' ? 'success' : detail.activeCredential ? 'info' : 'warning'">
              {{ connectionDetail?.status ?? (detail.activeCredential ? 'Credential ready' : 'Credential needed') }}
            </AppBadge>
            <h2>Reporter access</h2>
            <p class="text-meta">
              {{ detail.activeCredential ? `Secret ending ${detail.activeCredential.secretHint}` : 'Issue credentials to connect the plugin.' }}
            </p>
          </div>
        </AppCard>
        <AppCard>
          <div class="stack stack--sm">
            <SiteHealthBadge :status="detail.health.status" />
            <h2>Operational health</h2>
            <p class="text-meta">{{ detail.health.reason }}</p>
            <AppButton :loading="busy" variant="secondary" @click="testConnection">Test connection</AppButton>
          </div>
        </AppCard>
      </div>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

      <nav class="site-tabs" role="tablist" aria-label="Site detail sections">
        <button
          v-for="tab in tabs"
          :id="`site-tab-${tab.id}`"
          :key="tab.id"
          class="site-tabs__button"
          :class="{ 'site-tabs__button--active': activeTab === tab.id }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`site-panel-${tab.id}`"
          @click="setActiveTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section
        v-show="activeTab === 'overview'"
        id="site-panel-overview"
        role="tabpanel"
        aria-labelledby="site-tab-overview"
      >
        <AppPanel title="Site details" description="Update the managed-site inventory record.">
          <form class="stack" @submit.prevent="updateSite">
            <AppInput v-model="name" label="Site name" name="name" />
            <AppInput v-model="url" label="Site URL" name="url" type="url" />
            <div class="grid">
              <AppInput v-model="hostingProvider" label="Hosting provider" name="hosting-provider" />
              <AppInput v-model="backupStrategy" label="Backup strategy" name="backup-strategy" />
              <AppSelect
                v-model="riskLevel"
                label="Risk level"
                name="risk-level"
                :options="[
                  { label: 'Low', value: 'low' },
                  { label: 'Standard', value: 'standard' },
                  { label: 'High', value: 'high' }
                ]"
              />
            </div>
            <AppTextarea v-model="notes" label="Operational notes" name="notes" />
            <div class="cluster">
              <AppButton :loading="busy" type="submit">Save changes</AppButton>
              <AppButton
                v-if="detail.site.status === 'active'"
                :disabled="busy"
                variant="danger"
                @click="disableSite"
              >
                Disable site
              </AppButton>
            </div>
          </form>
        </AppPanel>
      </section>

      <section
        v-if="isAdmin && activeTab === 'service'"
        id="site-panel-service"
        role="tabpanel"
        aria-labelledby="site-tab-service"
      >
        <header class="section-heading">
          <p class="eyebrow">Service access</p>
          <h2>Plan, lifecycle, and entitlements</h2>
          <p>Manage the underlying SiteCare plan, paid-period transitions, and logged temporary exceptions.</p>
        </header>
        <SiteServicePlanSection :site-id="siteId" />
      </section>

      <section
        v-if="isAdmin && activeTab === 'notifications'"
        id="site-panel-notifications"
        role="tabpanel"
        aria-labelledby="site-tab-notifications"
      >
        <header class="section-heading">
          <p class="eyebrow">Transactional email</p>
          <h2>Recipients and message categories</h2>
          <p>Choose who receives backup, uptime, update, SiteHealth, security, and service email for this site.</p>
        </header>
        <SiteNotificationRecipientsSection :site-id="siteId" />
      </section>

      <section
        v-show="activeTab === 'reports'"
        id="site-panel-reports"
        role="tabpanel"
        aria-labelledby="site-tab-reports"
      >
        <header class="section-heading">
          <p class="eyebrow">Annual and on-demand review</p>
          <h2>SiteHealth Checkups and Reviews</h2>
          <p>Collect evidence, revise findings and recommendations, publish the client Review, and record approval before cleanup.</p>
        </header>
        <SiteHealthSection :site-id="siteId" />
      </section>

      <section
        v-show="activeTab === 'updates'"
        id="site-panel-updates"
        role="tabpanel"
        aria-labelledby="site-tab-updates"
      >
        <SiteUpdatesSection :site-id="siteId" />
      </section>

      <section
        v-show="activeTab === 'uptime'"
        id="site-panel-uptime"
        role="tabpanel"
        aria-labelledby="site-tab-uptime"
      >
        <SiteUptimeSection :site-id="siteId" :is-admin="isAdmin" />
      </section>

      <section
        v-show="activeTab === 'security'"
        id="site-panel-security"
        role="tabpanel"
        aria-labelledby="site-tab-security"
      >
        <SiteSecurityStatusSection :site-id="siteId" />
      </section>

      <section
        v-show="activeTab === 'backups'"
        id="site-panel-backups"
        role="tabpanel"
        aria-labelledby="site-tab-backups"
      >
        <header class="section-heading">
          <p class="eyebrow">Remote operations foundation</p>
          <h2>Backups and restore planning</h2>
          <p>Manage dashboard-owned backup policy, connection capability, artifacts, and safe restore preflight.</p>
        </header>
        <SiteBackupsSection :site-id="siteId" />
      </section>

      <section
        v-show="activeTab === 'integrations'"
        id="site-panel-integrations"
        role="tabpanel"
        aria-labelledby="site-tab-integrations"
      >
        <AppPanel
          title="External visibility"
          description="Read-only checks against systems that remain the source of truth."
        >
          <div class="grid">
            <AppCard v-for="provider in ['cloudflare', 'dropbox', 'hostinger'] as const" :key="provider" muted>
              <div class="stack stack--sm">
                <AppBadge :tone="integrationResults[provider]?.state === 'healthy' ? 'success' : 'neutral'">
                  {{ integrationResults[provider]?.state ?? 'Not checked' }}
                </AppBadge>
                <h2>{{ provider.charAt(0).toUpperCase() + provider.slice(1) }}</h2>
                <p class="text-meta">{{ integrationResults[provider]?.summary ?? 'Run a read-only provider check.' }}</p>
                <AppButton :loading="busy" variant="secondary" @click="inspectIntegration(provider)">Check now</AppButton>
              </div>
            </AppCard>
          </div>
        </AppPanel>
      </section>

      <section
        v-show="activeTab === 'credentials'"
        id="site-panel-credentials"
        role="tabpanel"
        aria-labelledby="site-tab-credentials"
      >
        <AppPanel
          title="Site credentials"
          description="The connector rotates credentials automatically with a fallback overlap. Manual reconnect is reserved for recovery."
        >
          <div class="stack">
            <div>
              <p class="text-meta">Site ID</p>
              <code>{{ detail.site.id }}</code>
            </div>
            <div v-if="issuedSecret" class="secret">
              <p><strong>Recovery site secret</strong></p>
              <code>{{ issuedSecret }}</code>
              <p class="text-meta">This secret is shown once. Store it in the reporter plugin now.</p>
            </div>
            <div v-if="connectionDetail?.connection" class="grid">
              <AppCard muted>
                <p class="text-meta">Connector version</p>
                <h2>{{ connectionDetail.connection.pluginVersion ?? 'Legacy contract' }}</h2>
                <span class="text-meta">Contract v{{ connectionDetail.connection.contractVersion }}</span>
              </AppCard>
              <AppCard muted>
                <p class="text-meta">Last authenticated</p>
                <h2>{{ connectionDetail.connection.lastAuthenticatedAt ? formatSiteCareDateTime(connectionDetail.connection.lastAuthenticatedAt) : 'Never' }}</h2>
              </AppCard>
              <AppCard muted>
                <p class="text-meta">Next automatic rotation</p>
                <h2>{{ connectionDetail.connection.rotationDueAt ? formatSiteCareDate(connectionDetail.connection.rotationDueAt) : 'After first connection' }}</h2>
              </AppCard>
            </div>
            <AppTable v-if="connectionDetail?.credentials?.length" caption="Credential lifecycle" :columns="['Issued', 'Hint', 'State', 'Last used', 'Valid until']">
              <tr v-for="credential in connectionDetail.credentials" :key="credential.id">
                <td>{{ formatSiteCareDateTime(credential.createdAt) }}</td>
                <td>••••••{{ credential.secretHint }}</td>
                <td><AppBadge :tone="credential.state === 'active' ? 'success' : credential.state === 'pending' ? 'warning' : 'neutral'">{{ credential.state }}</AppBadge></td>
                <td>{{ credential.lastUsedAt ? formatSiteCareDateTime(credential.lastUsedAt) : 'Never' }}</td>
                <td>{{ credential.validUntil ? formatSiteCareDateTime(credential.validUntil) : '—' }}</td>
              </tr>
            </AppTable>
            <div class="cluster">
              <AppButton :loading="busy" variant="secondary" @click="issueCredential">
                {{ detail.activeCredential ? 'Reconnect with a new secret' : 'Generate initial credential' }}
              </AppButton>
              <AppButton v-if="isAdmin && detail.activeCredential" :disabled="busy" variant="danger" @click="revokeConnection">
                Revoke connection
              </AppButton>
            </div>
          </div>
        </AppPanel>
      </section>

      <section
        v-show="activeTab === 'audit'"
        id="site-panel-audit"
        role="tabpanel"
        aria-labelledby="site-tab-audit"
      >
        <AppPanel title="Site audit log" description="Important events for this managed site.">
          <AuditTimeline :events="auditEvents" />
        </AppPanel>
      </section>
    </div>
  </div>
</template>

<style scoped>
.site-tabs {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding: var(--space-2);
  border: var(--border-default);
  border-color: var(--color-card-border);
  border-radius: var(--radius-xl);
  background: rgb(7 13 23 / 58%);
  box-shadow: inset 0 1px 0 var(--color-card-highlight);
}

.site-tabs__button {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  transition:
    background var(--motion-base) var(--ease-standard),
    border-color var(--motion-base) var(--ease-standard),
    color var(--motion-base) var(--ease-standard),
    box-shadow var(--motion-base) var(--ease-standard);
}

.site-tabs__button:hover {
  border-color: var(--color-card-border);
  color: var(--color-text);
}

.site-tabs__button--active {
  border-color: var(--color-border-glow);
  background: var(--gradient-selected);
  color: var(--color-text);
  box-shadow: var(--shadow-nav-selected);
}

.notice,
.error {
  margin-bottom: var(--space-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

code {
  overflow-wrap: anywhere;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
}

.secret {
  padding: var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-alert);
}
</style>
