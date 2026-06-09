import { requireAccessIdentity } from '../utils/auth'

const PUBLIC_PATHS = new Set(['/api/health'])
const PUBLIC_PREFIXES = ['/_nuxt/', '/__nuxt_error']

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return
  }

  requireAccessIdentity(event)
})

