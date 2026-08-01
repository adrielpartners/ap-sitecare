<script setup lang="ts">
interface ProviderStatus {
  provider: 'brevo' | 'mailgun' | 'postmark' | 'sendgrid'
  apiKeyConfigured: boolean
  webhookTokenConfigured: boolean
  configuration: Record<string, string>
  operational: boolean
  updatedAt: string | null
}

interface EmailSettingsResponse {
  global: {
    selectedProvider: string
    fromAddress: string
    fromName: string
    replyTo: string | null
    branding: { logoUrl?: string, accentColor?: string }
    source: string
  }
  providers: ProviderStatus[]
  channels: Array<{ channel: string, operational: boolean }>
}

const api = useSiteCareApi()
const { data: settingsResponse, refresh: refreshSettings } = await useFetch<any>('/api/admin/email/settings')
const { data: outboxResponse, refresh: refreshOutbox } = await useFetch<any>('/api/admin/email/outbox?limit=25')
const { data: eventResponse, refresh: refreshEvents } = await useFetch<any>('/api/admin/email/delivery-events?limit=25')
const { data: suppressionResponse, refresh: refreshSuppressions } = await useFetch<any>('/api/admin/email/suppressions')
const settings = computed<EmailSettingsResponse | null>(() => settingsResponse.value?.data ?? null)
const outbox = computed<any[]>(() => outboxResponse.value?.data ?? [])
const deliveryEvents = computed<any[]>(() => eventResponse.value?.data ?? [])
const suppressions = computed<any[]>(() => suppressionResponse.value?.data ?? [])
const selectedProvider = ref('brevo')
const fromAddress = ref('')
const fromName = ref('SiteCare')
const replyTo = ref('')
const logoUrl = ref('')
const accentColor = ref('')
const configurationProvider = ref<'brevo' | 'mailgun' | 'postmark' | 'sendgrid'>('brevo')
const apiKey = ref('')
const webhookToken = ref('')
const mailgunDomain = ref('')
const mailgunBaseUrl = ref('')
const postmarkMessageStream = ref('')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

watch(settings, (value: EmailSettingsResponse | null) => {
  if (!value) return
  selectedProvider.value = value.global.selectedProvider
  fromAddress.value = value.global.fromAddress
  fromName.value = value.global.fromName
  replyTo.value = value.global.replyTo ?? ''
  logoUrl.value = value.global.branding.logoUrl ?? ''
  accentColor.value = value.global.branding.accentColor ?? ''
  loadProviderFields()
}, { immediate: true })

watch(configurationProvider, loadProviderFields)

function loadProviderFields() {
  apiKey.value = ''
  webhookToken.value = ''
  const saved = settings.value?.providers.find((provider: ProviderStatus) => provider.provider === configurationProvider.value)
  mailgunDomain.value = saved?.configuration.domain ?? ''
  mailgunBaseUrl.value = saved?.configuration.baseUrl ?? ''
  postmarkMessageStream.value = saved?.configuration.messageStream ?? ''
}

function providerLabel(provider: string): string {
  if (provider === 'sendgrid') return 'SendGrid'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

function dateTime(value: string | null): string {
  return value ? formatSiteCareDateTime(value) : 'Not recorded'
}

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (['delivered', 'sent'].includes(status)) return 'success'
  if (['bounced', 'suppressed', 'failed'].includes(status)) return 'danger'
  if (status === 'sending') return 'info'
  return 'neutral'
}

async function saveGlobal() {
  await runAction(async () => {
    await api('/api/admin/email/settings', {
      method: 'PUT',
      body: {
        selectedProvider: selectedProvider.value,
        fromAddress: fromAddress.value,
        fromName: fromName.value,
        replyTo: replyTo.value || undefined,
        branding: {
          logoUrl: logoUrl.value || undefined,
          accentColor: accentColor.value || undefined
        }
      }
    })
    notice.value = 'Global email settings saved.'
    await refreshSettings()
  })
}

async function saveProvider() {
  await runAction(async () => {
    const configuration = configurationProvider.value === 'mailgun'
      ? { domain: mailgunDomain.value, baseUrl: mailgunBaseUrl.value }
      : configurationProvider.value === 'postmark'
        ? { messageStream: postmarkMessageStream.value }
        : {}
    await api(`/api/admin/email/providers/${configurationProvider.value}`, {
      method: 'PUT',
      body: {
        apiKey: apiKey.value || undefined,
        webhookToken: webhookToken.value || undefined,
        configuration
      }
    })
    notice.value = `${providerLabel(configurationProvider.value)} configuration saved.`
    apiKey.value = ''
    webhookToken.value = ''
    await refreshSettings()
  })
}

async function liftSuppression(email: string) {
  await runAction(async () => {
    await api('/api/admin/email/suppressions/lift', { method: 'POST', body: { email } })
    notice.value = `Suppression lifted for ${email}.`
    await Promise.all([refreshSuppressions(), refreshOutbox()])
  })
}

async function refreshHistory() {
  await Promise.all([refreshOutbox(), refreshEvents(), refreshSuppressions()])
}

async function runAction(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = requestError(error, 'The email setting could not be updated.')
  } finally {
    busy.value = false
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
  <div class="stack">
    <p v-if="notice" class="email-message email-message--notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="email-message email-message--error" role="alert">{{ errorMessage }}</p>

    <AppPanel title="Transactional email" description="Email is queued durably, sent by a separate worker, and tracked independently for every recipient.">
      <div v-if="settings" class="grid">
        <AppCard v-for="provider in settings.providers" :key="provider.provider" :tone="provider.operational && provider.apiKeyConfigured ? 'success' : 'neutral'">
          <div class="stack stack--sm">
            <div class="cluster">
              <AppBadge :tone="provider.operational ? 'success' : 'neutral'">{{ provider.operational ? 'Adapter ready' : 'Foundation only' }}</AppBadge>
              <AppBadge :tone="provider.apiKeyConfigured ? 'success' : 'warning'">{{ provider.apiKeyConfigured ? 'API key saved' : 'API key needed' }}</AppBadge>
            </div>
            <h3>{{ providerLabel(provider.provider) }}</h3>
            <p class="text-meta">{{ provider.provider === 'brevo' ? 'Operational REST delivery provider for launch.' : 'Configuration can be saved; sending remains disabled until its adapter is implemented.' }}</p>
          </div>
        </AppCard>
      </div>
    </AppPanel>

    <AppPanel title="Global sending identity" description="These settings apply to every Dashboard-generated email. Recipients and message categories remain site-specific.">
      <form class="stack" @submit.prevent="saveGlobal">
        <div class="grid">
          <AppSelect v-model="selectedProvider" label="Active provider" name="active-email-provider" :options="[{ label: 'Brevo', value: 'brevo' }]" />
          <AppInput v-model="fromAddress" label="From address" name="email-from-address" type="email" required />
          <AppInput v-model="fromName" label="From name" name="email-from-name" required />
          <AppInput v-model="replyTo" label="Reply-To address" name="email-reply-to" type="email" />
          <AppInput v-model="logoUrl" label="Brand logo URL" name="email-logo-url" type="url" description="Optional HTTPS image URL used by report templates." />
          <AppInput v-model="accentColor" label="Brand accent color" name="email-accent-color" placeholder="#5b8cff" description="Optional six-digit hex color." />
        </div>
        <div class="cluster">
          <AppButton type="submit" :loading="busy">Save global settings</AppButton>
          <AppBadge v-if="settings" tone="info">Source · {{ settings.global.source }}</AppBadge>
        </div>
      </form>
    </AppPanel>

    <AppPanel title="Provider credentials" description="API keys and webhook bearer tokens are encrypted before storage and are never returned by the Dashboard.">
      <form class="stack" @submit.prevent="saveProvider">
        <div class="grid">
          <AppSelect v-model="configurationProvider" label="Configure provider" name="configure-email-provider" :options="[
            { label: 'Brevo', value: 'brevo' },
            { label: 'Mailgun (foundation)', value: 'mailgun' },
            { label: 'Postmark (foundation)', value: 'postmark' },
            { label: 'SendGrid (foundation)', value: 'sendgrid' }
          ]" />
          <AppInput v-model="apiKey" label="REST API key" name="provider-api-key" type="password" description="Leave blank to retain the saved key." />
          <AppInput v-model="webhookToken" label="Webhook bearer token" name="provider-webhook-token" type="password" description="Use the same token in the provider's secured webhook configuration." />
          <template v-if="configurationProvider === 'mailgun'">
            <AppInput v-model="mailgunDomain" label="Mailgun domain" name="mailgun-domain" />
            <AppInput v-model="mailgunBaseUrl" label="Mailgun API base URL" name="mailgun-base-url" type="url" />
          </template>
          <AppInput v-if="configurationProvider === 'postmark'" v-model="postmarkMessageStream" label="Postmark message stream" name="postmark-message-stream" />
        </div>
        <div class="provider-note">
          <strong>Brevo webhook URL</strong>
          <code>/api/webhooks/email/brevo</code>
          <span>Configure a secured Authorization header using <code>Bearer &lt;your token&gt;</code>.</span>
        </div>
        <AppButton type="submit" :loading="busy">Save provider configuration</AppButton>
      </form>
    </AppPanel>

    <AppPanel v-if="settings" title="Notification channels" description="The shared contract leaves room for additional channels without representing unfinished adapters as active.">
      <div class="grid">
        <AppCard v-for="channel in settings.channels" :key="channel.channel" muted>
          <div class="stack stack--sm">
            <AppBadge :tone="channel.operational ? 'success' : 'neutral'">{{ channel.operational ? 'Operational' : 'Stub only' }}</AppBadge>
            <h3>{{ providerLabel(channel.channel) }}</h3>
            <p class="text-meta">{{ channel.operational ? 'Available for transactional notifications.' : 'Interface reserved for a later implementation.' }}</p>
          </div>
        </AppCard>
      </div>
    </AppPanel>

    <AppPanel title="Delivery history" description="Provider acceptance, delivery, bounces, and suppressions remain inspectable without retaining completed message bodies.">
      <div class="cluster email-history-controls">
        <AppButton variant="secondary" :disabled="busy" @click="refreshHistory">Refresh history</AppButton>
      </div>
      <AppTable v-if="outbox.length" caption="Transactional email outbox" :columns="['Recipient', 'Message', 'Provider', 'Status', 'Attempts', 'Updated']">
        <tr v-for="message in outbox" :key="message.id">
          <td>{{ message.recipientEmail }}</td>
          <td><strong>{{ message.subject || message.messageType }}</strong><br><span class="text-meta">{{ message.notificationCategory }}</span></td>
          <td>{{ providerLabel(message.provider) }}</td>
          <td><AppBadge :tone="statusTone(message.status)">{{ message.status }}</AppBadge></td>
          <td>{{ message.attemptCount }} / {{ message.maxAttempts }}</td>
          <td>{{ dateTime(message.updatedAt) }}</td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No outgoing messages" description="Queued transactional email will appear here." />
    </AppPanel>

    <AppPanel title="Provider events and suppressions" description="Hard bounces, complaints, invalid addresses, blocks, and unsubscribes prevent additional delivery until reviewed.">
      <div class="email-history-grid">
        <div>
          <h3>Recent provider events</h3>
          <AppTable v-if="deliveryEvents.length" caption="Email provider events" :columns="['Recipient', 'Event', 'Occurred']">
            <tr v-for="event in deliveryEvents" :key="event.id">
              <td>{{ event.recipientEmail }}</td>
              <td><AppBadge :tone="statusTone(event.eventType)">{{ event.eventType }}</AppBadge></td>
              <td>{{ dateTime(event.occurredAt) }}</td>
            </tr>
          </AppTable>
          <AppEmptyState v-else title="No provider events" description="Delivery webhooks will be recorded here." />
        </div>
        <div>
          <h3>Suppression list</h3>
          <AppTable v-if="suppressions.length" caption="Email suppression list" :columns="['Recipient', 'Reason', 'State', 'Control']">
            <tr v-for="suppression in suppressions" :key="suppression.recipientEmail">
              <td>{{ suppression.recipientEmail }}</td>
              <td>{{ suppression.reason }}</td>
              <td><AppBadge :tone="suppression.liftedAt ? 'neutral' : 'danger'">{{ suppression.liftedAt ? 'Lifted' : 'Active' }}</AppBadge></td>
              <td><AppButton v-if="!suppression.liftedAt" variant="secondary" :loading="busy" @click="liftSuppression(suppression.recipientEmail)">Lift</AppButton></td>
            </tr>
          </AppTable>
          <AppEmptyState v-else title="No suppressed recipients" description="Addresses blocked from future delivery will appear here." />
        </div>
      </div>
    </AppPanel>
  </div>
</template>

<style scoped>
.email-message {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.email-message--notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.email-message--error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.provider-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.provider-note code {
  color: var(--color-info);
}

.email-history-controls {
  margin-bottom: var(--space-4);
}

.email-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
}

.email-history-grid h3 {
  margin-bottom: var(--space-3);
}

@media (max-width: 70rem) {
  .email-history-grid {
    grid-template-columns: 1fr;
  }
}
</style>
