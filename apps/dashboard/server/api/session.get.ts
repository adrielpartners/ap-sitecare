import { requireAccessIdentity } from '../utils/auth'

export default defineEventHandler((event) => {
  const identity = requireAccessIdentity(event)

  return {
    ok: true,
    user: identity
  }
})

