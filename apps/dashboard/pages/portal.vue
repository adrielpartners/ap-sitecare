<script setup lang="ts">
useHead({ title: 'My SiteCare' })
const api = useSiteCareApi()
const { data: response, refresh, status } = await useFetch<any>('/api/client/portal')
const portal = computed(() => response.value?.data)
const expanded = ref<string[]>([])
const busy = ref('')
const errorMessage = ref('')
const recipient = reactive({ siteId: '', email: '', displayName: '', categories: ['updates', 'backup', 'sitehealth'] })
const categoryOptions = ['backup', 'uptime', 'updates', 'sitehealth', 'security', 'service']

watch(() => portal.value?.sites, (sites: any[]) => {
  if (sites?.length && !expanded.value.length) expanded.value = [sites[0].id]
  if (sites?.length && !recipient.siteId) recipient.siteId = sites[0].id
}, { immediate: true })

function toggle(siteId: string): void {
  expanded.value = expanded.value.includes(siteId) ? expanded.value.filter((id: string) => id !== siteId) : [...expanded.value, siteId]
}

async function saveRecipient(): Promise<void> {
  busy.value = 'recipient'; errorMessage.value = ''
  try {
    await api(`/api/client/sites/${recipient.siteId}/notifications`, { method: 'POST', body: recipient })
    recipient.email = ''; recipient.displayName = ''
    await refresh()
  } catch (error) { errorMessage.value = (error as any)?.data?.statusMessage ?? 'The recipient could not be saved.' }
  finally { busy.value = '' }
}

async function removeRecipient(siteId: string, id: string): Promise<void> {
  busy.value = id; errorMessage.value = ''
  try { await api(`/api/client/sites/${siteId}/notifications/${id}`, { method: 'DELETE' }); await refresh() }
  catch (error) { errorMessage.value = (error as any)?.data?.statusMessage ?? 'The recipient could not be removed.' }
  finally { busy.value = '' }
}

function serviceLabel(value: string): string {
  return ({ 'wordpress-update-monitoring': 'WordPress update monitoring', 'hostinger-daily-backups': 'Hostinger daily backups', 'uptime-monitoring': 'Uptime monitoring', 'annual-sitehealth-checkup': 'Annual SiteHealth Checkup', 'long-term-backups': 'Long-term off-site backups' } as Record<string,string>)[value] ?? value
}
function statusTone(value: string): 'success'|'warning'|'danger'|'neutral' { return ['healthy','active','current','completed','available'].includes(value) ? 'success' : ['unhealthy','failed','critical'].includes(value) ? 'danger' : ['unknown','stale','attention','pending'].includes(value) ? 'warning' : 'neutral' }
function date(value: string | null): string { return value ? formatSiteCareDateTime(value) : 'Not currently available' }
function duration(seconds: number | null): string { if (seconds === null) return 'In progress'; const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min` }
</script>

<template>
  <div>
    <header class="page-heading portal-heading">
      <div><p class="eyebrow">Client Dashboard</p><h1>Welcome, {{ portal?.user.displayName }}</h1><p>A clear, read-only view of the care and protection behind your websites.</p></div>
      <div class="cluster"><AppButton variant="secondary" :loading="status === 'pending'" @click="refresh">Refresh</AppButton><a class="contact-link" href="mailto:sitecare@adrielpartners.com">Email SiteCare</a></div>
    </header>
    <p v-if="errorMessage" class="notice notice--error" role="alert">{{ errorMessage }}</p>
    <div v-if="portal?.sites.length" class="stack">
      <section v-for="site in portal.sites" :key="site.id" class="site-card">
        <button class="site-card__heading" type="button" :aria-expanded="expanded.includes(site.id)" @click="toggle(site.id)">
          <span><span class="eyebrow">{{ site.service.planName }}</span><strong>{{ site.name }}</strong><small>{{ site.url }}</small></span>
          <span class="cluster"><AppBadge :tone="site.service.operationalStatus === 'active' ? 'success' : 'warning'">{{ site.service.operationalStatus }}</AppBadge><span aria-hidden="true">{{ expanded.includes(site.id) ? '−' : '+' }}</span></span>
        </button>
        <div v-if="expanded.includes(site.id)" class="site-card__body stack">
          <div class="metric-grid">
            <AppCard :tone="site.updates.pendingCount === 0 && !site.updates.stale ? 'success' : 'warning'"><p class="eyebrow">Updates</p><strong>{{ site.updates.pendingCount ?? '—' }} pending</strong><p class="text-meta">Checked {{ date(site.updates.checkedAt) }}</p></AppCard>
            <AppCard :tone="statusTone(site.backups.hostinger.availability)"><p class="eyebrow">Hostinger backup</p><strong>{{ date(site.backups.hostinger.latestSuccessfulAt) }}</strong><p class="text-meta">{{ site.backups.hostinger.retentionDays }}-day retention</p></AppCard>
            <AppCard v-if="site.backups.sitecare.included" :tone="site.backups.sitecare.latestSuccessfulAt ? 'success' : 'warning'"><p class="eyebrow">SiteCare off-site backup</p><strong>{{ date(site.backups.sitecare.latestSuccessfulAt) }}</strong><p class="text-meta">{{ site.backups.sitecare.retentionMonths }}-month retention</p></AppCard>
            <AppCard v-if="site.uptime.included" :tone="statusTone(site.uptime.status)"><p class="eyebrow">Uptime</p><strong>{{ site.uptime.status }}</strong><p class="text-meta">Last confirmed {{ date(site.uptime.lastSuccessAt) }}</p></AppCard>
            <AppCard :tone="site.security.reviewControlCount === 0 && site.security.tlsHealthy ? 'success' : 'warning'"><p class="eyebrow">Security</p><strong>{{ site.security.activeControlCount }} checks active</strong><p class="text-meta">{{ site.security.reviewControlCount }} awaiting review · TLS {{ site.security.tlsHealthy ? 'healthy' : 'attention' }}</p></AppCard>
          </div>

          <div class="detail-grid">
            <AppPanel title="Included in your plan">
              <ul class="check-list"><li v-for="capability in site.service.includedServices" :key="capability">{{ serviceLabel(capability) }}</li></ul>
            </AppPanel>
            <AppPanel title="SiteHealth Reviews">
              <div v-if="site.reviews.length" class="stack stack--sm"><NuxtLink v-for="review in site.reviews" :key="review.id" :to="`/reports/${review.id}`" class="review-link"><span><strong>{{ review.title }}</strong><small>Published {{ date(review.publishedAt) }}</small></span><span>Read →</span></NuxtLink></div>
              <AppEmptyState v-else title="No published Reviews yet" description="Your annual or manually requested Review will appear here after technician approval." />
            </AppPanel>
          </div>

          <AppPanel v-if="site.updates.recentActivity.length" title="Recent WordPress update activity">
            <AppTable caption="Recent update activity" :columns="['Component','Version','Completed','Result']"><tr v-for="item in site.updates.recentActivity" :key="item.id"><td>{{ item.name }}</td><td>{{ item.priorVersion || '—' }} → {{ item.resultingVersion || '—' }}</td><td>{{ date(item.completedAt) }}</td><td><AppBadge :tone="statusTone(item.outcome)">{{ item.outcome }}</AppBadge></td></tr></AppTable>
          </AppPanel>

          <AppPanel v-if="site.uptime.included" title="Recent uptime incidents">
            <AppTable v-if="site.uptime.recentIncidents.length" caption="Recent uptime incidents" :columns="['Started','Recovered','Duration','Status']"><tr v-for="incident in site.uptime.recentIncidents" :key="incident.id"><td>{{ date(incident.startedAt) }}</td><td>{{ date(incident.recoveredAt) }}</td><td>{{ duration(incident.durationSeconds) }}</td><td><AppBadge :tone="incident.status === 'recovered' ? 'success' : 'danger'">{{ incident.status }}</AppBadge></td></tr></AppTable>
            <AppEmptyState v-else title="No downtime incidents" description="No confirmed downtime is recorded in the current history." />
          </AppPanel>

          <AppPanel title="Email recipients" description="Choose who receives operational email for this website.">
            <div v-if="site.notificationRecipients.length" class="recipient-list"><div v-for="item in site.notificationRecipients" :key="item.id"><span><strong>{{ item.displayName || item.email }}</strong><small>{{ item.email }} · {{ item.categories.join(', ') }}</small></span><AppButton variant="secondary" :loading="busy === item.id" @click="removeRecipient(site.id, item.id)">Remove</AppButton></div></div>
          </AppPanel>
        </div>
      </section>

      <AppPanel title="Add email recipient" description="Recipients and email types are specific to the selected website.">
        <div class="form-grid"><label class="field"><span>Website</span><select v-model="recipient.siteId"><option v-for="site in portal.sites" :key="site.id" :value="site.id">{{ site.name }}</option></select></label><label class="field"><span>Name</span><input v-model="recipient.displayName" autocomplete="name"></label><label class="field"><span>Email</span><input v-model="recipient.email" type="email" autocomplete="email"></label></div>
        <fieldset class="category-list"><legend>Email types</legend><label v-for="category in categoryOptions" :key="category"><input v-model="recipient.categories" type="checkbox" :value="category"> {{ category }}</label></fieldset>
        <AppButton :loading="busy === 'recipient'" :disabled="!recipient.siteId || !recipient.email || !recipient.categories.length" @click="saveRecipient">Add recipient</AppButton>
      </AppPanel>
    </div>
    <AppEmptyState v-else title="No websites assigned" description="Your SiteCare team can connect websites to this client account." />
  </div>
</template>

<style scoped>
.portal-heading{display:flex;align-items:end;justify-content:space-between;gap:var(--space-4)}.contact-link{padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);background:var(--color-primary);color:white;text-decoration:none}.site-card{overflow:hidden;border:var(--border-default);border-radius:var(--radius-xl);background:var(--color-surface);box-shadow:var(--shadow-card)}.site-card__heading{display:flex;width:100%;align-items:center;justify-content:space-between;gap:var(--space-4);padding:var(--space-5);border:0;background:transparent;color:inherit;text-align:left}.site-card__heading>span:first-child{display:grid;gap:var(--space-1)}.site-card__heading strong{font-size:var(--font-size-xl)}.site-card__heading small,.review-link small,.recipient-list small{color:var(--color-text-muted)}.site-card__body{padding:0 var(--space-5) var(--space-5)}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:var(--space-3)}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4)}.check-list{display:grid;gap:var(--space-2);padding:0;list-style:none}.check-list li::before{margin-right:var(--space-2);color:var(--color-success);content:'✓'}.review-link,.recipient-list>div{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);border:var(--border-default);border-radius:var(--radius-md);color:inherit;text-decoration:none}.review-link span:first-child,.recipient-list span{display:grid}.recipient-list{display:grid;gap:var(--space-2)}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-3)}.category-list{display:flex;flex-wrap:wrap;gap:var(--space-4);margin:var(--space-4) 0;padding:var(--space-3);border:var(--border-default);border-radius:var(--radius-md)}.notice--error{background:var(--color-danger-soft);color:var(--color-danger)}@media(max-width:52rem){.portal-heading{align-items:start;flex-direction:column}.detail-grid,.form-grid{grid-template-columns:1fr}.site-card__heading{align-items:start}.site-card__body{padding-inline:var(--space-3)}}
</style>
