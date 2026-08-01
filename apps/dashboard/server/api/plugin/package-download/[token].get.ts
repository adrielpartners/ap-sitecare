import { getPluginRolloutService } from '../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw createError({ statusCode: 404, statusMessage: 'Package not found.' })
  const packageValue = await getPluginRolloutService(event).claimPackage(token)
  if (!packageValue) throw createError({ statusCode: 404, statusMessage: 'Package not found.' })
  setResponseHeaders(event, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${packageValue.filename}"`,
    'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff',
    'x-apsc-sha256': packageValue.checksumSha256
  })
  return packageValue.buffer
})
