import { getBackupDestinationService } from '../../../utils/backup-destinations'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  try {
    if (typeof query.code !== 'string' || typeof query.state !== 'string') {
      throw new Error('Dropbox authorization response is incomplete.')
    }
    await getBackupDestinationService(event).completeDropboxOAuth(query.code, query.state)
    return sendRedirect(event, '/settings?dropbox=connected', 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dropbox authorization failed.'
    return sendRedirect(event, `/settings?dropbox=error&message=${encodeURIComponent(message)}`, 302)
  }
})
