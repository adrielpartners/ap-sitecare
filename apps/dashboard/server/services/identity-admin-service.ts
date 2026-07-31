import { randomUUID } from 'node:crypto'
import type { ClientAccount, MembershipRole } from '../auth/types'
import { IdentityRepository } from '../repositories/identity-repository'
import { useDatabase, type TransactionalQueryExecutor } from '../utils/database'
import { AuthenticationService } from './authentication-service'

export interface UpdateUserAccessInput {
  status: 'active' | 'disabled'
  mfaRequired: boolean
  role: MembershipRole
  allSites: boolean
  clientAccountId: string | null
  siteIds: string[]
}

export class IdentityAdminService {
  constructor(
    private readonly database: TransactionalQueryExecutor = useDatabase(),
    private readonly authenticationService = new AuthenticationService()
  ) {}

  async listUsers() {
    return new IdentityRepository(this.database).listUsers()
  }

  async listInvitations() {
    return new IdentityRepository(this.database).listInvitations()
  }

  async invite(input: Parameters<AuthenticationService['createInvitation']>[0]) {
    return (await this.authenticationService.createInvitation(input)).invitation
  }

  async updateUser(userId: string, input: UpdateUserAccessInput, actorUserId: string): Promise<void> {
    if (userId === actorUserId && input.status === 'disabled') {
      throw new Error('You cannot disable your own account.')
    }
    const now = new Date().toISOString()
    await this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      const user = await repository.findUserById(userId)
      if (!user) throw new Error('User not found.')
      const memberships = await repository.listMembershipsForUser(userId)
      const membership = memberships[0]
      if (!membership) throw new Error('User membership not found.')
      if (input.role === 'client' && (!input.clientAccountId || input.allSites)) {
        throw new Error('Client users must belong to one client account.')
      }
      if (input.role !== 'client' && input.clientAccountId) {
        throw new Error('Staff users cannot belong to a client account.')
      }
      await repository.updateUser({
        ...user,
        status: input.status,
        mfaRequired: input.mfaRequired || input.role === 'admin',
        disabledAt: input.status === 'disabled' ? now : null,
        updatedAt: now
      })
      await repository.updateMembership({
        ...membership,
        role: input.role,
        clientAccountId: input.role === 'client' ? input.clientAccountId : null,
        allSites: input.role === 'admin' ? true : input.allSites,
        updatedAt: now
      })
      await repository.replaceMembershipSiteAccess(
        membership.id,
        input.role === 'team-member' && !input.allSites ? input.siteIds : [],
        now
      )
      if (input.status === 'disabled') {
        await repository.revokeUserSessions(user.id, now, actorUserId)
      }
    })
  }

  async createClient(name: string): Promise<ClientAccount> {
    const normalized = name.trim()
    if (!normalized) throw new Error('Client name is required.')
    const now = new Date().toISOString()
    return new IdentityRepository(this.database).createClientAccount({
      id: randomUUID(),
      name: normalized,
      status: 'active',
      isPlaceholder: false,
      createdAt: now,
      updatedAt: now
    })
  }

  async listClients(): Promise<Array<ClientAccount & { siteIds: string[] }>> {
    const repository = new IdentityRepository(this.database)
    const [clients, assignments] = await Promise.all([
      repository.listClientAccounts(),
      repository.listClientSiteAssignments()
    ])
    return clients.map(client => ({
      ...client,
      siteIds: assignments.filter(item => item.clientAccountId === client.id).map(item => item.siteId)
    }))
  }

  async assignSite(clientAccountId: string, siteId: string, actorUserId: string): Promise<void> {
    const clients = await new IdentityRepository(this.database).listClientAccounts()
    if (!clients.some(client => client.id === clientAccountId)) throw new Error('Client not found.')
    await new IdentityRepository(this.database).assignSiteToClient(
      siteId,
      clientAccountId,
      actorUserId,
      new Date().toISOString()
    )
  }
}
