<script setup lang="ts">
interface NotificationRecipient {
  id: string
  email: string
  displayName: string | null
  enabled: boolean
  categories: string[]
  updatedAt: string
}

const props = defineProps<{ siteId: string }>()
const api = useSiteCareApi()
const categories = [
  { value: 'backup', label: 'Backups', description: 'Completion, failure, and retention notices.' },
  { value: 'uptime', label: 'Uptime', description: 'Downtime, TLS, and recovery messages.' },
  { value: 'updates', label: 'Updates', description: 'Core, plugin, and theme activity.' },
  { value: 'sitehealth', label: 'SiteHealth', description: 'Checkup and SiteHealth Review delivery.' },
  { value: 'security', label: 'Security', description: 'Cloudflare security-status notices.' },
  { value: 'service', label: 'Service', description: 'Plan and service lifecycle messages.' }
]
const recipientsUrl = computed(() => `/api/admin/sites/${props.siteId}/notifications/recipients`)
const { data: response, refresh } = await useFetch<any>(recipientsUrl)
const recipients = computed<NotificationRecipient[]>(() => response.value?.data ?? [])
const editingId = ref('')
const email = ref('')
const displayName = ref('')
const enabled = ref(true)
const selectedCategories = ref<string[]>(['backup'])
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

function categorySelected(category: string): boolean {
  return selectedCategories.value.includes(category)
}

function setCategory(category: string, selected: boolean) {
  selectedCategories.value = selected
    ? [...new Set([...selectedCategories.value, category])]
    : selectedCategories.value.filter((item: string) => item !== category)
}

function editRecipient(recipient: NotificationRecipient) {
  editingId.value = recipient.id
  email.value = recipient.email
  displayName.value = recipient.displayName ?? ''
  enabled.value = recipient.enabled
  selectedCategories.value = [...recipient.categories]
  notice.value = ''
  errorMessage.value = ''
}

function resetForm() {
  editingId.value = ''
  email.value = ''
  displayName.value = ''
  enabled.value = true
  selectedCategories.value = ['backup']
}

async function saveRecipient() {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    const path = editingId.value ? `${recipientsUrl.value}/${editingId.value}` : recipientsUrl.value
    await api(path, {
      method: editingId.value ? 'PUT' : 'POST',
      body: {
        email: email.value,
        displayName: displayName.value || undefined,
        enabled: enabled.value,
        categories: selectedCategories.value
      }
    })
    notice.value = editingId.value ? 'Notification recipient updated.' : 'Notification recipient added.'
    resetForm()
    await refresh()
  } catch (error) {
    errorMessage.value = requestError(error, 'The notification recipient could not be saved.')
  } finally {
    busy.value = false
  }
}

async function deleteRecipient(recipient: NotificationRecipient) {
  if (!window.confirm(`Remove ${recipient.email} from this site's notifications?`)) return
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await api(`${recipientsUrl.value}/${recipient.id}`, { method: 'DELETE' })
    if (editingId.value === recipient.id) resetForm()
    notice.value = 'Notification recipient removed.'
    await refresh()
  } catch (error) {
    errorMessage.value = requestError(error, 'The notification recipient could not be removed.')
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
    <p v-if="notice" class="recipient-message recipient-message--notice" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="recipient-message recipient-message--error" role="alert">{{ errorMessage }}</p>

    <AppPanel title="Email recipients" description="Each recipient is delivered and tracked independently. Categories are configured for this site only.">
      <AppTable v-if="recipients.length" caption="Site notification recipients" :columns="['Recipient', 'Email categories', 'Status', 'Controls']">
        <tr v-for="recipient in recipients" :key="recipient.id">
          <td><strong>{{ recipient.displayName ?? recipient.email }}</strong><br><span class="text-meta">{{ recipient.email }}</span></td>
          <td>
            <div class="cluster">
              <AppBadge v-for="category in recipient.categories" :key="category" tone="info">{{ category }}</AppBadge>
            </div>
          </td>
          <td><AppBadge :tone="recipient.enabled ? 'success' : 'neutral'">{{ recipient.enabled ? 'Enabled' : 'Paused' }}</AppBadge></td>
          <td>
            <div class="cluster">
              <AppButton variant="secondary" :disabled="busy" @click="editRecipient(recipient)">Edit</AppButton>
              <AppButton variant="danger" :disabled="busy" @click="deleteRecipient(recipient)">Remove</AppButton>
            </div>
          </td>
        </tr>
      </AppTable>
      <AppEmptyState v-else title="No site recipients" description="Add at least one recipient before automated site messages can be sent." />
    </AppPanel>

    <AppPanel :title="editingId ? 'Edit recipient' : 'Add recipient'" description="Choose exactly which types of SiteCare email this address should receive.">
      <form class="stack" @submit.prevent="saveRecipient">
        <div class="grid">
          <AppInput v-model="displayName" label="Display name" name="notification-display-name" placeholder="Client or team member" />
          <AppInput v-model="email" label="Email address" name="notification-email" type="email" required />
          <AppCheckbox v-model="enabled" name="notification-enabled" label="Enable this recipient" description="Paused recipients retain their preferences without receiving new email." />
        </div>
        <div>
          <p class="recipient-label">Email categories</p>
          <div class="grid">
            <AppCheckbox
              v-for="category in categories"
              :key="category.value"
              :model-value="categorySelected(category.value)"
              :name="`notification-${category.value}`"
              :label="category.label"
              :description="category.description"
              @update:model-value="setCategory(category.value, $event)"
            />
          </div>
        </div>
        <div class="cluster">
          <AppButton type="submit" :loading="busy">{{ editingId ? 'Update recipient' : 'Add recipient' }}</AppButton>
          <AppButton v-if="editingId" variant="secondary" :disabled="busy" @click="resetForm">Cancel edit</AppButton>
        </div>
      </form>
    </AppPanel>
  </div>
</template>

<style scoped>
.recipient-message {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.recipient-message--notice {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.recipient-message--error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.recipient-label {
  margin-bottom: var(--space-3);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}
</style>
