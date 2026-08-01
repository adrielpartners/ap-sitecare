<script setup lang="ts">
useHead({ title: 'Central plugin updates' })
const api = useSiteCareApi()
const { data: packageResponse, refresh: refreshPackages } = await useFetch('/api/admin/plugin-packages')
const { data: rolloutResponse, refresh: refreshRollouts } = await useFetch('/api/admin/plugin-rollouts')
const packages = computed(() => packageResponse.value?.data ?? [])
const rollouts = computed(() => rolloutResponse.value?.data ?? [])
const uploadFile = ref<File | null>(null)
const sourceNote = ref('')
const busy = ref('')
const errorMessage = ref('')
const selectedRollout = ref<any>(null)
const mfaCode = ref('')
const mfaChallenge = ref<{ challengeToken: string, destinationHint: string, expiresAt: string } | null>(null)
const evidence = reactive({ siteId: '', backupReference: '', backupCompletedAt: '', validUntil: '', notes: '' })

async function upload(): Promise<void> {
  if (!uploadFile.value) return
  busy.value = 'upload'; errorMessage.value = ''
  const body = new FormData()
  body.append('package', uploadFile.value)
  body.append('sourceNote', sourceNote.value)
  try {
    await api('/api/admin/plugin-packages', { method: 'POST', body })
    uploadFile.value = null; sourceNote.value = ''
    await refreshPackages()
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function createRollout(packageId: string): Promise<void> {
  busy.value = packageId; errorMessage.value = ''
  try {
    const response = await api<any>(`/api/admin/plugin-packages/${packageId}/rollouts`, { method: 'POST', body: { canarySize: 1, failureThreshold: 1, concurrencyLimit: 2 } })
    selectedRollout.value = response.data
    await refreshRollouts()
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function openRollout(id: string): Promise<void> {
  busy.value = id; errorMessage.value = ''
  try { selectedRollout.value = (await api<any>(`/api/admin/plugin-rollouts/${id}`)).data }
  catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function saveSelection(): Promise<void> {
  busy.value = 'selection'; errorMessage.value = ''
  try {
    selectedRollout.value = (await api<any>(`/api/admin/plugin-rollouts/${selectedRollout.value.rollout.id}/targets`, {
      method: 'PUT', body: { targetIds: selectedRollout.value.targets.filter((target: any) => target.selected).map((target: any) => target.id) }
    })).data
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function confirmRollout(): Promise<void> {
  busy.value = 'confirm'; errorMessage.value = ''
  try {
    if (!mfaChallenge.value) throw new Error('Request an email verification code first.')
    selectedRollout.value = (await api<any>(`/api/admin/plugin-rollouts/${selectedRollout.value.rollout.id}/confirm`, {
      method: 'POST',
      body: { challengeToken: mfaChallenge.value.challengeToken, code: mfaCode.value }
    })).data
    mfaCode.value = ''
    mfaChallenge.value = null
    await refreshRollouts()
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function requestMfaCode(): Promise<void> {
  busy.value = 'mfa-code'; errorMessage.value = ''
  try {
    mfaChallenge.value = (await api<{ data: { challengeToken: string, destinationHint: string, expiresAt: string } }>(
      '/api/profile/mfa/challenge', { method: 'POST' }
    )).data
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function retryTarget(targetId: string): Promise<void> {
  busy.value = targetId; errorMessage.value = ''
  try {
    selectedRollout.value = (await api<any>(`/api/admin/plugin-rollouts/${selectedRollout.value.rollout.id}/targets/${targetId}/retry`, { method: 'POST' })).data
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

async function saveEvidence(): Promise<void> {
  busy.value = 'evidence'; errorMessage.value = ''
  try {
    await api(`/api/admin/sites/${evidence.siteId}/recovery-evidence`, { method: 'POST', body: evidence })
    const packageId = selectedRollout.value.package.id
    selectedRollout.value = (await api<any>(`/api/admin/plugin-packages/${packageId}/rollouts`, { method: 'POST', body: {} })).data
    Object.assign(evidence, { siteId: '', backupReference: '', backupCompletedAt: '', validUntil: '', notes: '' })
    await refreshRollouts()
  } catch (error) { errorMessage.value = message(error) }
  finally { busy.value = '' }
}

function fileChanged(event: Event): void { uploadFile.value = (event.target as HTMLInputElement).files?.[0] ?? null }
function message(error: unknown): string { return (error as any)?.data?.statusMessage ?? (error instanceof Error ? error.message : 'The request failed.') }
function tone(status: string): 'success' | 'warning' | 'danger' | 'neutral' { return ['completed','succeeded','validated','eligible'].includes(status) ? 'success' : ['failed','needs-attention'].includes(status) ? 'danger' : ['draft','paused','recovery-required'].includes(status) ? 'warning' : 'neutral' }
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Administrator operation</p>
      <h1>Central plugin updates</h1>
      <p>Validate a vendor ZIP, review automatically discovered targets, and release it through a recovery-gated canary rollout.</p>
    </header>
    <p v-if="errorMessage" class="text-danger" role="alert">{{ errorMessage }}</p>
    <div class="stack">
      <AppPanel title="Upload package" description="ZIP files remain quarantined and private until structural validation succeeds.">
        <div class="grid">
          <label class="field"><span>WordPress plugin ZIP</span><input type="file" accept=".zip,application/zip" @change="fileChanged"></label>
          <label class="field"><span>Provenance note</span><input v-model="sourceNote" placeholder="Vendor and download source"></label>
        </div>
        <AppButton :disabled="!uploadFile" :loading="busy === 'upload'" @click="upload">Validate package</AppButton>
      </AppPanel>

      <AppPanel title="Validated packages">
        <div v-if="packages.length" class="stack">
          <AppCard v-for="item in packages" :key="item.id" muted>
            <div class="cluster cluster--between">
              <div><strong>{{ item.pluginName }} {{ item.version }}</strong><p class="text-meta">{{ item.pluginSlug }} · SHA-256 {{ item.checksumSha256.slice(0, 12) }}… · {{ item.scanStatus }}</p></div>
              <AppButton :loading="busy === item.id" @click="createRollout(item.id)">Discover targets</AppButton>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No packages uploaded" description="Upload a vendor plugin ZIP to begin." />
      </AppPanel>

      <AppPanel title="Rollout history">
        <div class="stack">
          <button v-for="item in rollouts" :key="item.id" class="row-button" type="button" @click="openRollout(item.id)">
            <span><strong>{{ item.package.pluginName }} {{ item.package.version }}</strong><small>{{ formatSiteCareDateTime(item.createdAt) }}</small></span>
            <AppBadge :tone="tone(item.status)">{{ item.status }}</AppBadge>
          </button>
        </div>
      </AppPanel>

      <AppPanel v-if="selectedRollout" :title="`${selectedRollout.package.pluginName} ${selectedRollout.package.version}`" :description="`Rollout ${selectedRollout.rollout.id}`">
        <div class="cluster"><AppBadge :tone="tone(selectedRollout.rollout.status)">{{ selectedRollout.rollout.status }}</AppBadge><span class="text-meta">Canary {{ selectedRollout.rollout.canarySize }} · halt at {{ selectedRollout.rollout.failureThreshold }} failure(s) · concurrency {{ selectedRollout.rollout.concurrencyLimit }}</span></div>
        <p v-if="selectedRollout.rollout.haltReason" class="text-danger">{{ selectedRollout.rollout.haltReason }}</p>
        <div class="table-wrap section-gap"><table><thead><tr><th>Select</th><th>Site</th><th>Version</th><th>Readiness</th><th>Result</th><th></th></tr></thead><tbody>
          <tr v-for="target in selectedRollout.targets" :key="target.id">
            <td><input v-model="target.selected" type="checkbox" :disabled="selectedRollout.rollout.status !== 'draft'"></td>
            <td><strong>{{ target.siteName }}</strong><br><small>{{ target.siteUrl }}</small></td>
            <td>{{ target.installedVersion || 'Not reported' }} → {{ target.targetVersion }}</td>
            <td><AppBadge :tone="tone(target.category)">{{ target.category }}</AppBadge><br><small>{{ target.preflightMessage }}</small></td>
            <td><AppBadge :tone="tone(target.status)">{{ target.status }}</AppBadge><br><small v-if="target.errorMessage">{{ target.errorMessage }}</small></td>
            <td><AppButton v-if="['failed','needs-attention'].includes(target.status)" variant="secondary" :loading="busy === target.id" @click="retryTarget(target.id)">Retry</AppButton></td>
          </tr>
        </tbody></table></div>
        <div v-if="selectedRollout.rollout.status === 'draft'" class="cluster section-gap">
          <AppButton variant="secondary" :loading="busy === 'selection'" @click="saveSelection">Save selection</AppButton>
          <AppButton variant="secondary" :loading="busy === 'mfa-code'" @click="requestMfaCode">Email verification code</AppButton>
          <label v-if="mfaChallenge" class="field field--compact"><span>Email or recovery code</span><input v-model="mfaCode" maxlength="32" autocomplete="one-time-code" :placeholder="`Sent to ${mfaChallenge.destinationHint}`"></label>
          <AppButton :disabled="!mfaChallenge || mfaCode.length < 6" :loading="busy === 'confirm'" @click="confirmRollout">Confirm and run canary</AppButton>
        </div>
        <AppCard v-if="selectedRollout.rollout.status === 'draft' && selectedRollout.targets.some((target: any) => target.category === 'recovery-required')" muted class="section-gap">
          <h3>Record technician-confirmed Hostinger recovery evidence</h3>
          <div class="grid">
            <label class="field"><span>Site</span><select v-model="evidence.siteId"><option value="">Select site</option><option v-for="target in selectedRollout.targets.filter((item: any) => item.category === 'recovery-required')" :key="target.siteId" :value="target.siteId">{{ target.siteName }}</option></select></label>
            <label class="field"><span>Backup reference</span><input v-model="evidence.backupReference"></label>
            <label class="field"><span>Backup completed</span><input v-model="evidence.backupCompletedAt" type="datetime-local"></label>
            <label class="field"><span>Evidence valid until</span><input v-model="evidence.validUntil" type="datetime-local"></label>
          </div>
          <label class="field"><span>Notes</span><input v-model="evidence.notes"></label>
          <AppButton :loading="busy === 'evidence'" :disabled="!evidence.siteId" @click="saveEvidence">Save and rediscover targets</AppButton>
        </AppCard>
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.row-button{display:flex;width:100%;align-items:center;justify-content:space-between;padding:var(--space-4);border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface-muted);color:inherit;text-align:left}.row-button span{display:grid}.table-wrap{overflow-x:auto}.field--compact{min-width:12rem}table{width:100%;border-collapse:collapse}th,td{padding:var(--space-3);border-bottom:var(--border-default);text-align:left;vertical-align:top}
</style>
