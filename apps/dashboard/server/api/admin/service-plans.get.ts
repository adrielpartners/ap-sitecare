import { EntitlementService } from '../../services/entitlement-service'

export default defineEventHandler(() => ({
  ok: true,
  data: new EntitlementService().listPlans()
}))
