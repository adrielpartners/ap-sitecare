<script setup lang="ts">
const route = useRoute()
const siteId = computed(() => String(route.params.id))
const { data: response, refresh } = await useFetch(() => `/api/sites/${siteId.value}`)
const { data: auditResponse } = await useFetch(() => `/api/sites/${siteId.value}/audit`)
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
const integrationResults = ref<Record<string, { state: string, summary: string, checkedAt: string }>>({})

watch(detail, (value) => {
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
    await $fetch(`/api/sites/${siteId.value}`, {
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
    await $fetch(`/api/sites/${siteId.value}/disable`, { method: 'POST' })
    notice.value = 'Site disabled.'
    await refresh()
  })
}

async function issueCredential() {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${siteId.value}/credentials`, { method: 'POST' })
    issuedSecret.value = result.data.secret
    notice.value = 'Credential issued. Save the secret now; it will not be shown again.'
    await refresh()
  })
}

async function testConnection() {
  await runAction(async () => {
    const result = await $fetch(`/api/sites/${siteId.value}/connection`)
    notice.value = result.data.message
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
            <p class="text-meta">Registered {{ new Date(detail.site.createdAt).toLocaleString() }}</p>
          </div>
        </AppCard>
        <AppCard>
          <div class="stack stack--sm">
            <AppBadge :tone="detail.activeCredential ? 'info' : 'warning'">
              {{ detail.activeCredential ? 'Credential ready' : 'Credential needed' }}
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

      <AppPanel
        title="Latest WordPress report"
        description="Operational data reported by the AP SiteCare WordPress agent."
      >
        <div v-if="detail.health.latest" class="grid">
          <AppCard muted><p class="text-meta">WordPress</p><h2>{{ detail.health.latest.wordpressVersion ?? 'Unknown' }}</h2></AppCard>
          <AppCard muted><p class="text-meta">PHP</p><h2>{{ detail.health.latest.phpVersion ?? 'Unknown' }}</h2></AppCard>
          <AppCard muted><p class="text-meta">Plugin updates</p><h2>{{ detail.health.latest.pluginUpdateCount }}</h2></AppCard>
          <AppCard muted><p class="text-meta">Theme updates</p><h2>{{ detail.health.latest.themeUpdateCount }}</h2></AppCard>
        </div>
        <AppEmptyState
          v-else
          title="Awaiting the first report"
          description="Configure the WordPress reporter plugin and send a manual check-in."
        />
      </AppPanel>

      <AppPanel
        title="Site credentials"
        description="The reporter plugin uses the site ID and shared secret to sign requests."
      >
        <div class="stack">
          <div>
            <p class="text-meta">Site ID</p>
            <code>{{ detail.site.id }}</code>
          </div>
          <div v-if="issuedSecret" class="secret">
            <p><strong>New site secret</strong></p>
            <code>{{ issuedSecret }}</code>
            <p class="text-meta">This secret is shown once. Store it in the reporter plugin now.</p>
          </div>
          <AppButton :loading="busy" variant="secondary" @click="issueCredential">
            {{ detail.activeCredential ? 'Rotate credential' : 'Generate credential' }}
          </AppButton>
        </div>
      </AppPanel>

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

      <AppPanel title="Site audit log" description="Important events for this managed site.">
        <AuditTimeline :events="auditEvents" />
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
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
