import { OperationalHealthService } from '../../../services/operational-health-service'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler(async event => ({ ok: true, data: await new OperationalHealthService(getRuntimeSettings(event)).inspect() }))
