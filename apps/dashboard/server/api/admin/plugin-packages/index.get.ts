import { getPluginPackageService } from '../../../utils/plugin-updates'

export default defineEventHandler(async event => ({ ok: true, data: await getPluginPackageService(event).list() }))
