import type { H3Event } from 'h3'

export interface AccessIdentity {
  email: string
  source: 'cloudflare-access' | 'development-bypass'
}

export function requireAccessIdentity(event: H3Event): AccessIdentity {
  const config = useRuntimeConfig(event)

  if (config.auth.developmentBypass) {
    return {
      email: config.auth.developmentEmail,
      source: 'development-bypass'
    }
  }

  const email = getHeader(event, 'cf-access-authenticated-user-email')
  const assertion = getHeader(event, 'cf-access-jwt-assertion')

  if (!email || !assertion) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Cloudflare Access authentication is required.'
    })
  }

  return {
    email,
    source: 'cloudflare-access'
  }
}

