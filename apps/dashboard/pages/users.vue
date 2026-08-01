<script setup lang="ts">
interface UserMembership {
  role: 'admin' | 'team-member' | 'client'
  allSites: boolean
  clientAccountId: string | null
  siteIds: string[]
}

interface UserRecord {
  id: string
  email: string
  displayName: string
  status: 'active' | 'disabled'
  mfaRequired: boolean
  memberships: UserMembership[]
}

interface ClientOption {
  id: string
  name: string
}

interface SiteOption {
  id: string
  name: string
}

interface InvitationRecord {
  id: string
  email: string
  role: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

useHead({ title: 'Users and access' })
const api = useSiteCareApi()
const { data: usersResponse, refresh: refreshUsers } = await useFetch('/api/admin/users')
const { data: invitationsResponse, refresh: refreshInvitations } = await useFetch('/api/admin/invitations')
const { data: clientsResponse } = await useFetch('/api/admin/clients')
const { data: sitesResponse } = await useFetch('/api/sites')
const users = computed<UserRecord[]>(() => usersResponse.value?.data ?? [])
const invitations = computed<InvitationRecord[]>(() => invitationsResponse.value?.data ?? [])
const clients = computed<ClientOption[]>(() => clientsResponse.value?.data ?? [])
const sites = computed<SiteOption[]>(() => sitesResponse.value?.data ?? [])
const email = ref('')
const displayName = ref('')
const role = ref('team-member')
const clientAccountId = ref('')
const allSites = ref(true)
const selectedSiteIds = ref<string[]>([])
const busy = ref(false)
const notice = ref('')
const error = ref('')
const edits = reactive<Record<string, {
  status: 'active' | 'disabled'
  role: 'admin' | 'team-member' | 'client'
  mfaRequired: boolean
  allSites: boolean
  clientAccountId: string
  siteIds: string[]
}>>({})

watch(users, (value: UserRecord[]) => {
  for (const user of value) {
    const membership = user.memberships[0]
    if (!membership || edits[user.id]) continue
    edits[user.id] = {
      status: user.status,
      role: membership.role,
      mfaRequired: user.mfaRequired,
      allSites: membership.allSites,
      clientAccountId: membership.clientAccountId || '',
      siteIds: [...membership.siteIds]
    }
  }
}, { immediate: true })

watch(role, (value: string) => {
  allSites.value = value === 'admin' || value === 'team-member'
  clientAccountId.value = ''
  selectedSiteIds.value = []
})

function toggleSite(siteId: string, checked: boolean): void {
  selectedSiteIds.value = checked
    ? [...new Set([...selectedSiteIds.value, siteId])]
    : selectedSiteIds.value.filter((id: string) => id !== siteId)
}

async function invite(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await api('/api/admin/invitations', {
      method: 'POST',
      body: {
        email: email.value,
        displayName: displayName.value,
        role: role.value,
        clientAccountId: role.value === 'client' ? clientAccountId.value : null,
        allSites: role.value === 'admin' || (role.value === 'team-member' && allSites.value),
        siteIds: selectedSiteIds.value
      }
    })
    email.value = ''
    displayName.value = ''
    notice.value = 'Invitation queued for email delivery.'
    await refreshInvitations()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'Invitation could not be created.'
  } finally {
    busy.value = false
  }
}

async function toggleUserStatus(user: any): Promise<void> {
  const membership = user.memberships[0]
  if (!membership) return
  busy.value = true
  await api(`/api/admin/users/${user.id}`, {
    method: 'PATCH',
    body: {
      status: user.status === 'active' ? 'disabled' : 'active',
      mfaRequired: user.mfaRequired,
      role: membership.role,
      allSites: membership.allSites,
      clientAccountId: membership.clientAccountId,
      siteIds: []
    }
  })
  await refreshUsers()
  busy.value = false
}

function toggleUserSite(userId: string, siteId: string, checked: boolean): void {
  const edit = edits[userId]
  if (!edit) return
  edit.siteIds = checked
    ? [...new Set([...edit.siteIds, siteId])]
    : edit.siteIds.filter((id: string) => id !== siteId)
}

async function saveUserAccess(userId: string): Promise<void> {
  const edit = edits[userId]
  if (!edit) return
  busy.value = true
  error.value = ''
  try {
    await api(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: {
        ...edit,
        allSites: edit.role === 'admin' || (edit.role === 'team-member' && edit.allSites),
        clientAccountId: edit.role === 'client' ? edit.clientAccountId : null
      }
    })
    notice.value = 'User access updated.'
    await refreshUsers()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'User access could not be updated.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Identity & access</p>
      <h1>Users and access</h1>
      <p>Invite administrators, operational team members, and isolated client users. There is no public registration.</p>
    </header>
    <div class="stack">
      <p v-if="notice" class="text-meta" role="status">{{ notice }}</p>
      <p v-if="error" class="users-error" role="alert">{{ error }}</p>
      <AppPanel title="Invite a user" description="Invitations expire after seven days and are delivered through the durable email outbox.">
        <form class="stack" @submit.prevent="invite">
          <div class="grid">
            <AppInput v-model="email" label="Email" name="invite-email" type="email" required />
            <AppInput v-model="displayName" label="Name (optional)" name="invite-name" />
            <AppSelect v-model="role" label="Role" name="invite-role" :options="[
              { label: 'Team Member', value: 'team-member' },
              { label: 'Client', value: 'client' },
              { label: 'Admin', value: 'admin' }
            ]" />
            <AppSelect
              v-if="role === 'client'"
              v-model="clientAccountId"
              label="Client account"
              name="invite-client"
              :options="[
                { label: 'Choose client', value: '' },
                ...clients.map((client: ClientOption) => ({ label: client.name, value: client.id }))
              ]"
              required
            />
            <AppCheckbox
              v-if="role === 'team-member'"
              v-model="allSites"
              name="invite-all-sites"
              label="Access all operational sites"
              description="Turn off to select specific sites."
            />
          </div>
          <fieldset v-if="role === 'team-member' && !allSites" class="users-sites">
            <legend>Allowed sites</legend>
            <label v-for="site in sites" :key="site.id">
              <input
                type="checkbox"
                :checked="selectedSiteIds.includes(site.id)"
                @change="toggleSite(site.id, ($event.target as HTMLInputElement).checked)"
              >
              {{ site.name }}
            </label>
          </fieldset>
          <AppButton type="submit" :loading="busy">Send invitation</AppButton>
        </form>
      </AppPanel>
      <AppPanel title="Active users" :description="`${users.length} accounts`">
        <div class="grid">
          <AppCard v-for="user in users" :key="user.id" :tone="user.status === 'active' ? 'neutral' : 'warning'">
            <div class="stack stack--sm">
              <h3>{{ user.displayName }}</h3>
              <p class="text-meta">{{ user.email }}</p>
              <div class="cluster">
                <AppBadge>{{ user.memberships[0]?.role }}</AppBadge>
                <AppBadge :tone="user.status === 'active' ? 'success' : 'warning'">{{ user.status }}</AppBadge>
                <AppBadge v-if="user.mfaRequired" tone="info">MFA required</AppBadge>
              </div>
              <template v-if="edits[user.id]">
                <AppSelect v-model="edits[user.id].role" label="Role" :name="`user-role-${user.id}`" :options="[
                  { label: 'Admin', value: 'admin' },
                  { label: 'Team Member', value: 'team-member' },
                  { label: 'Client', value: 'client' }
                ]" />
                <AppSelect
                  v-if="edits[user.id].role === 'client'"
                  v-model="edits[user.id].clientAccountId"
                  label="Client account"
                  :name="`user-client-${user.id}`"
                  :options="[
                    { label: 'Choose client', value: '' },
                    ...clients.map((client: ClientOption) => ({ label: client.name, value: client.id }))
                  ]"
                />
                <AppCheckbox
                  v-if="edits[user.id].role === 'team-member'"
                  v-model="edits[user.id].allSites"
                  :name="`user-all-sites-${user.id}`"
                  label="Access all sites"
                />
                <AppCheckbox
                  v-model="edits[user.id].mfaRequired"
                  :name="`user-mfa-${user.id}`"
                  label="Require MFA"
                  :disabled="edits[user.id].role === 'admin'"
                />
                <fieldset v-if="edits[user.id].role === 'team-member' && !edits[user.id].allSites" class="users-sites">
                  <legend>Allowed sites</legend>
                  <label v-for="site in sites" :key="site.id">
                    <input
                      type="checkbox"
                      :checked="edits[user.id].siteIds.includes(site.id)"
                      @change="toggleUserSite(user.id, site.id, ($event.target as HTMLInputElement).checked)"
                    >
                    {{ site.name }}
                  </label>
                </fieldset>
                <div class="cluster">
                  <AppButton :disabled="busy" @click="saveUserAccess(user.id)">Save access</AppButton>
                  <AppButton variant="secondary" :disabled="busy" @click="toggleUserStatus(user)">
                    {{ user.status === 'active' ? 'Disable account' : 'Reactivate account' }}
                  </AppButton>
                </div>
              </template>
            </div>
          </AppCard>
        </div>
      </AppPanel>
      <AppPanel title="Pending invitations" :description="`${invitations.filter((item: InvitationRecord) => !item.acceptedAt && !item.revokedAt).length} pending`">
        <div class="grid">
          <AppCard v-for="invitation in invitations" :key="invitation.id" muted>
            <strong>{{ invitation.email }}</strong>
            <p class="text-meta">{{ invitation.role }} · expires {{ formatSiteCareDateTime(invitation.expiresAt) }}</p>
          </AppCard>
        </div>
      </AppPanel>
    </div>
  </div>
</template>

<style scoped>
.users-error { color: var(--color-danger); }
.users-sites { display: grid; gap: var(--space-2); padding: var(--space-4); border: var(--border-default); border-radius: var(--radius-md); }
.users-sites label { display: flex; gap: var(--space-2); align-items: center; }
</style>
