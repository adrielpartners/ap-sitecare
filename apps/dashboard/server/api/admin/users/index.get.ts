import { IdentityAdminService } from '../../../services/identity-admin-service'

export default defineEventHandler(async () => ({
  ok: true,
  data: await new IdentityAdminService().listUsers()
}))
