<script setup lang="ts">
const api = useSiteCareApi()
const name = ref('')
const url = ref('')
const hostingProvider = ref('')
const backupStrategy = ref('')
const riskLevel = ref('standard')
const notes = ref('')
const clientAccountId = ref('')
const planId = ref('sitecare-core')
const errorMessage = ref('')
const saving = ref(false)
const { data: clientResponse } = await useFetch<any>('/api/admin/clients')
const { data: planResponse } = await useFetch<any>('/api/admin/service-plans')
const clients = computed(() => (clientResponse.value?.data ?? []).filter((client: any) => !client.isPlaceholder))
const plans = computed(() => planResponse.value?.data ?? [])

async function registerSite() {
  errorMessage.value = ''
  saving.value = true
  try {
    const response = await api<any>('/api/sites', {
      method: 'POST',
      body: {
        name: name.value,
        url: url.value,
        clientAccountId: clientAccountId.value,
        planId: planId.value,
        hostingProvider: hostingProvider.value,
        backupStrategy: backupStrategy.value,
        riskLevel: riskLevel.value,
        notes: notes.value
      }
    })
    await navigateTo(`/sites/${response.data.id}`)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The site could not be registered.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Site registration</p>
      <h1>Add a managed site</h1>
      <p>Every site must begin with a client owner and SiteCare plan. Credentials can be issued from the site detail page.</p>
    </header>

    <AppPanel title="Site details" description="Use the public canonical URL for the WordPress website.">
      <form class="stack" @submit.prevent="registerSite">
        <AppInput v-model="name" label="Site name" name="name" placeholder="Example Client Website" />
        <AppInput
          v-model="url"
          label="Site URL"
          name="url"
          placeholder="https://example.com"
          type="url"
        />
        <div class="grid">
          <AppSelect
            v-model="clientAccountId"
            label="Client account"
            name="client-account"
            required
            :options="[
              { label: 'Choose a client', value: '' },
              ...clients.map((client: any) => ({ label: client.name, value: client.id }))
            ]"
          />
          <AppSelect
            v-model="planId"
            label="SiteCare plan"
            name="service-plan"
            required
            :options="plans.map((plan: any) => ({ label: plan.name, value: plan.id }))"
          />
        </div>
        <div class="grid">
          <AppInput v-model="hostingProvider" label="Hosting provider" name="hosting-provider" placeholder="Hostinger" />
          <AppInput v-model="backupStrategy" label="Backup strategy" name="backup-strategy" placeholder="Daily host backup + Dropbox" />
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
        <AppTextarea v-model="notes" label="Operational notes" name="notes" placeholder="Important maintenance context for operators." />
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <div class="cluster">
          <AppButton :loading="saving" type="submit">Register site</AppButton>
          <AppButton to="/sites" variant="quiet">Cancel</AppButton>
        </div>
      </form>
    </AppPanel>
  </div>
</template>

<style scoped>
.form-error {
  margin-bottom: var(--space-0);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}
</style>
