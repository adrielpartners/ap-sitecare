<script setup lang="ts">
const props = defineProps<{ siteId: string }>()
const api = useSiteCareApi()
const { data: response, refresh } = await useFetch<any>(() => `/api/sites/${props.siteId}/cloudflare`)
const detail = computed(() => response.value?.data)
const busyKey = ref('')
const notice = ref('')
const errorMessage = ref('')
const notes = ref<Record<string, string>>({})

function tone(status: string) {
  if (status === 'active') return 'success'
  if (status === 'inactive') return 'danger'
  if (status === 'pending' || status === 'review') return 'warning'
  return 'neutral'
}

async function run(key: string, action: () => Promise<void>) {
  busyKey.value = key
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Security Status could not be updated.'
  } finally {
    busyKey.value = ''
  }
}

async function synchronize() {
  await run('synchronize', async () => {
    await api(`/api/sites/${props.siteId}/cloudflare/security/synchronize`, { method: 'POST' })
    notice.value = 'Cloudflare Security Status synchronized.'
  })
}

async function setStatus(controlKey: string, status: 'active' | 'inactive') {
  await run(controlKey, async () => {
    await api(`/api/sites/${props.siteId}/cloudflare/security/${controlKey}`, {
      method: 'PUT', body: { status, notes: notes.value[controlKey] ?? '' }
    })
    notes.value[controlKey] = ''
    notice.value = `Technician evidence recorded as ${status}.`
  })
}
</script>

<template>
  <div class="stack">
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <AppPanel title="Cloudflare Security Status" description="A read-only Cloudflare checklist. Technician evidence can confirm settings that the API or current plan does not expose.">
      <div class="security-summary">
        <div>
          <p class="text-meta">Last API check</p>
          <h2>{{ detail?.security?.checkedAt ? formatSiteCareDateTime(detail.security.checkedAt) : 'Not checked' }}</h2>
        </div>
        <AppButton :loading="busyKey === 'synchronize'" @click="synchronize">Check Cloudflare now</AppButton>
      </div>
    </AppPanel>

    <div class="security-controls">
      <AppCard v-for="control in detail?.security?.controls ?? []" :key="control.controlKey" muted>
        <div class="stack stack--sm">
          <div class="control-heading">
            <h2>{{ control.label }}</h2>
            <AppBadge :tone="tone(control.status)">{{ control.status }}</AppBadge>
          </div>
          <p>{{ control.summary }}</p>
          <p v-if="control.technicianOverride" class="text-meta">Technician evidence by {{ control.technicianOverride.actorIdentifier }} on {{ formatSiteCareDateTime(control.technicianOverride.observedAt) }}.</p>
          <details>
            <summary>Record technician evidence</summary>
            <div class="stack stack--sm evidence-form">
              <AppInput v-model="notes[control.controlKey]" :label="`Evidence notes for ${control.label}`" :name="`security-${control.controlKey}`" placeholder="What was checked and where" />
              <div class="cluster">
                <AppButton :loading="busyKey === control.controlKey" variant="secondary" @click="setStatus(control.controlKey, 'active')">Mark Active</AppButton>
                <AppButton :loading="busyKey === control.controlKey" variant="danger" @click="setStatus(control.controlKey, 'inactive')">Mark Inactive</AppButton>
              </div>
            </div>
          </details>
        </div>
      </AppCard>
    </div>
  </div>
</template>

<style scoped>
.security-summary, .control-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.security-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: var(--space-4); }
.control-heading h2 { margin: 0; font-size: var(--font-size-lg); }
details summary { color: var(--color-text-muted); cursor: pointer; font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
.evidence-form { margin-top: var(--space-3); }
.notice, .error { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); }
.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }
@media (max-width: 42rem) { .security-summary, .control-heading { align-items: flex-start; flex-direction: column; } }
</style>
