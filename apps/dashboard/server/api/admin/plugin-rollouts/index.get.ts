import { getPluginRolloutService } from '../../../utils/plugin-updates'

export default defineEventHandler(async event => ({ ok: true, data: await getPluginRolloutService(event).list() }))
