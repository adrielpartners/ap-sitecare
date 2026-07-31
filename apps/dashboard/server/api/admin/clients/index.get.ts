import { ClientRegistryService } from '../../../services/client-registry-service'

export default defineEventHandler(async () => ({
  ok: true,
  data: await new ClientRegistryService().listClients()
}))
