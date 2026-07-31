<script setup lang="ts">
const route = useRoute()
const api = useSiteCareApi()
const clientId = computed(() => String(route.params.id))
const { data: response, refresh } = await useFetch<any>(() => `/api/admin/clients/${clientId.value}`)
const detail = computed(() => response.value?.data)
const name = ref('')
const statusReason = ref('')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

watch(detail, (value: any) => {
  if (value) name.value = value.client.name
}, { immediate: true })

async function renameClient() {
  await runAction(async () => {
    await api(`/api/admin/clients/${clientId.value}`, { method: 'PATCH', body: { name: name.value } })
    notice.value = 'Client name updated.'
    await refresh()
  })
}

async function changeStatus(status: 'active' | 'suspended') {
  await runAction(async () => {
    await api(`/api/admin/clients/${clientId.value}/status`, {
      method: 'POST',
      body: { status, reason: statusReason.value }
    })
    notice.value = status === 'suspended'
      ? 'Client services suspended. Historical records remain available.'
      : 'Client services reactivated according to each site plan.'
    statusReason.value = ''
    await refresh()
  })
}

async function runAction(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The client action could not be completed.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="detail">
    <header class="page-heading">
      <p class="eyebrow">Client registry</p>
      <h1>{{ detail.client.name }}</h1>
      <p>{{ detail.sites.length }} managed sites · {{ detail.userCount }} Client users</p>
    </header>

    <div class="stack">
      <div class="cluster">
        <AppBadge :tone="detail.client.status === 'active' ? 'success' : 'warning'">{{ detail.client.status }}</AppBadge>
        <AppBadge v-if="detail.client.isPlaceholder" tone="danger">Migration placeholder</AppBadge>
      </div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

      <AppPanel
        v-if="detail.client.isPlaceholder"
        title="Reassignment required"
        description="These existing sites were assigned here during the Phase 3 migration so no site was left without an owner. Reassign each site to its real client from the client registry."
      />

      <AppPanel v-else title="Client account" description="Suspension pauses monitoring, checkups, update services, and new long-term backups without deleting history.">
        <form class="stack" @submit.prevent="renameClient">
          <AppInput v-model="name" label="Client name" name="client-name" />
          <AppButton type="submit" :loading="busy">Save client name</AppButton>
        </form>
        <div class="status-actions">
          <AppInput v-model="statusReason" label="Status-change reason" name="status-reason" />
          <AppButton
            v-if="detail.client.status === 'active'"
            variant="danger"
            :loading="busy"
            :disabled="statusReason.trim().length < 3"
            @click="changeStatus('suspended')"
          >
            Suspend client services
          </AppButton>
          <AppButton
            v-else
            :loading="busy"
            :disabled="statusReason.trim().length < 3"
            @click="changeStatus('active')"
          >
            Reactivate client services
          </AppButton>
        </div>
      </AppPanel>

      <AppPanel title="Managed sites" :description="`${detail.sites.length} sites assigned to this client account`">
        <div v-if="detail.sites.length" class="grid">
          <AppCard v-for="item in detail.sites" :key="item.site.id">
            <div class="stack stack--sm">
              <div class="cluster">
                <AppBadge :tone="item.service.effective.operationalStatus === 'active' ? 'success' : 'warning'">
                  {{ item.service.effective.operationalStatus }}
                </AppBadge>
                <AppBadge tone="info">{{ item.service.effective.underlyingPlan.name }}</AppBadge>
              </div>
              <h3>{{ item.site.name }}</h3>
              <p class="text-meta">{{ item.site.url }}</p>
              <p v-if="item.service.effective.pendingTransition" class="text-meta">
                {{ item.service.effective.pendingTransition.transitionType }} scheduled for
                {{ new Date(item.service.effective.pendingTransition.effectiveAt).toLocaleString() }}
              </p>
              <p class="text-meta">{{ item.service.effective.activeOverrides.length }} active overrides</p>
              <AppButton :to="`/sites/${item.site.id}?tab=service`" variant="secondary">Manage site plan</AppButton>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No assigned sites" description="Assign sites from the client registry." />
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

.notice { background: var(--color-info-soft); color: var(--color-info); }
.error { background: var(--color-danger-soft); color: var(--color-danger); }

.status-actions {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: var(--border-default);
}
</style>
