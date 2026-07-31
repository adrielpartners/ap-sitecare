<script setup lang="ts">
useHead({ title: 'Clients' })
const api = useSiteCareApi()
const { data: clientResponse, refresh: refreshClients } = await useFetch('/api/admin/clients')
const { data: siteResponse } = await useFetch('/api/sites')
const clients = computed(() => clientResponse.value?.data ?? [])
const sites = computed<Array<{ id: string, name: string }>>(() => siteResponse.value?.data ?? [])
const name = ref('')
const selectedSite = reactive<Record<string, string>>({})
const busy = ref(false)
const notice = ref('')

async function createClient(): Promise<void> {
  busy.value = true
  await api('/api/admin/clients', { method: 'POST', body: { name: name.value } })
  name.value = ''
  notice.value = 'Client account created.'
  await refreshClients()
  busy.value = false
}

async function assignSite(clientId: string): Promise<void> {
  const siteId = selectedSite[clientId]
  if (!siteId) return
  busy.value = true
  await api(`/api/admin/clients/${clientId}/sites`, { method: 'PUT', body: { siteId } })
  selectedSite[clientId] = ''
  notice.value = 'Site ownership updated.'
  await refreshClients()
  busy.value = false
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Identity & access</p>
      <h1>Client accounts</h1>
      <p>Group sites under a client boundary before inviting read-only Client users.</p>
    </header>
    <div class="stack">
      <p v-if="notice" class="text-meta" role="status">{{ notice }}</p>
      <AppPanel title="Add client account">
        <form class="cluster" @submit.prevent="createClient">
          <AppInput v-model="name" label="Client name" name="client-name" required />
          <AppButton type="submit" :loading="busy">Create client</AppButton>
        </form>
      </AppPanel>
      <AppPanel title="Client registry" :description="`${clients.length} client accounts`">
        <div v-if="clients.length" class="grid">
          <AppCard v-for="client in clients" :key="client.id">
            <div class="stack stack--sm">
              <div class="cluster">
                <h3>{{ client.name }}</h3>
                <AppBadge :tone="client.status === 'active' ? 'success' : 'warning'">{{ client.status }}</AppBadge>
                <AppBadge v-if="client.isPlaceholder" tone="danger">Reassignment required</AppBadge>
              </div>
              <p class="text-meta">{{ client.siteIds.length }} assigned sites · {{ client.userCount }} Client users</p>
              <ul v-if="client.sites.length">
                <li v-for="site in client.sites" :key="site.id">
                  {{ site.name }} — {{ site.planName }}
                </li>
              </ul>
              <form v-if="!client.isPlaceholder" class="cluster" @submit.prevent="assignSite(client.id)">
                <AppSelect
                  v-model="selectedSite[client.id]"
                  label="Assign a site"
                  :name="`client-site-${client.id}`"
                  :options="[
                    { label: 'Choose site', value: '' },
                    ...sites.map((site: { id: string, name: string }) => ({ label: site.name, value: site.id }))
                  ]"
                />
                <AppButton type="submit" variant="secondary" :disabled="!selectedSite[client.id] || busy">Assign</AppButton>
              </form>
              <AppButton :to="`/clients/${client.id}`" variant="secondary">View client</AppButton>
            </div>
          </AppCard>
        </div>
        <AppEmptyState v-else title="No client accounts" description="Create the first client account above." />
      </AppPanel>
    </div>
  </div>
</template>
