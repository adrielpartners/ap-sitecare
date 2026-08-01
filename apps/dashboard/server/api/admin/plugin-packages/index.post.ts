import { getDashboardActor, handleApiError } from '../../../utils/api'
import { getRuntimeSettings } from '../../../utils/config'
import { getPluginPackageService } from '../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const maximumBytes = getRuntimeSettings(event).pluginPackages.maximumBytes
    const declaredBytes = Number(getHeader(event, 'content-length'))
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes + 1024 * 1024) {
      throw new Error(`Plugin package request exceeds the configured ${maximumBytes}-byte limit.`)
    }
    const parts = await readMultipartFormData(event)
    const file = parts?.find(part => part.name === 'package' && part.filename)
    const note = parts?.find(part => part.name === 'sourceNote')?.data.toString('utf8')
    if (!file?.filename) throw new Error('Plugin ZIP file is required.')
    return { ok: true, data: await getPluginPackageService(event).upload({
      buffer: file.data, filename: file.filename, actorIdentifier: getDashboardActor(event), sourceNote: note
    }) }
  } catch (error) {
    handleApiError(error)
  }
})
