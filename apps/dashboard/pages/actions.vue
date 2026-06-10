<script setup lang="ts">
const { data: response, refresh } = await useFetch('/api/action-requests')
const requests = computed(() => response.value?.data ?? [])
const busy = ref(false)
const errorMessage = ref('')

async function review(id: string, decision: 'approve' | 'reject') {
  busy.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/action-requests/${id}/${decision}`, { method: 'POST', body: {} })
    await refresh()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The request could not be reviewed.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Action requests</p>
      <h1>Review proposals</h1>
      <p>Approval records intent only. Version One never executes maintenance actions.</p>
    </header>

    <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
    <AppPanel title="Requests" :description="`${requests.length} proposals`">
      <div v-if="requests.length" class="stack">
        <AppCard v-for="request in requests" :key="request.id" muted>
          <div class="stack stack--sm">
            <AppBadge :tone="request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'neutral'">
              {{ request.status }}
            </AppBadge>
            <h2>{{ request.actionType }}</h2>
            <p>{{ request.rationale }}</p>
            <p class="text-meta">Requested by {{ request.requestedBy }} · {{ new Date(request.createdAt).toLocaleString() }}</p>
            <div v-if="request.status === 'pending'" class="cluster">
              <AppButton :disabled="busy" @click="review(request.id, 'approve')">Approve proposal</AppButton>
              <AppButton :disabled="busy" variant="secondary" @click="review(request.id, 'reject')">Reject</AppButton>
            </div>
          </div>
        </AppCard>
      </div>
      <AppEmptyState
        v-else
        title="No action requests"
        description="Future agents and operators can create reviewable proposals through the API."
      />
    </AppPanel>
  </div>
</template>

<style scoped>
.form-error {
  margin-bottom: var(--space-4);
  color: var(--color-danger);
}
</style>
