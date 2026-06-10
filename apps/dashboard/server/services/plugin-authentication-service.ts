import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { CredentialService } from './credential-service'
import { SiteService } from './site-service'

const MAX_REQUEST_AGE_SECONDS = 300

export interface AuthenticatedPluginRequest {
  siteId: string
  requestTimestamp: string
  rawBody: string
}

export interface PluginRequestInput {
  siteId?: string
  timestamp?: string
  signature?: string
  rawBody: string
}

class PluginAuthenticationError extends Error {
  readonly statusMessage: string

  constructor(readonly statusCode: number, message: string) {
    super(message)
    this.statusMessage = message
  }
}

export function createPluginSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export class PluginAuthenticationService {
  constructor(
    private readonly encryptionKey: string,
    private readonly credentialService = new CredentialService(encryptionKey),
    private readonly siteService = new SiteService()
  ) {}

  async authenticate(event: H3Event, now = Date.now()): Promise<AuthenticatedPluginRequest> {
    return this.authenticateRequest({
      siteId: getHeader(event, 'x-apsc-site-id'),
      timestamp: getHeader(event, 'x-apsc-timestamp'),
      signature: getHeader(event, 'x-apsc-signature'),
      rawBody: await readRawBody(event) ?? ''
    }, now)
  }

  authenticateRequest(input: PluginRequestInput, now = Date.now()): AuthenticatedPluginRequest {
    const { siteId, timestamp, signature, rawBody } = input

    if (!siteId || !timestamp || !signature) {
      throw new PluginAuthenticationError(401, 'Signed plugin headers are required.')
    }

    const requestTime = Date.parse(timestamp)
    if (!Number.isFinite(requestTime) || Math.abs(now - requestTime) > MAX_REQUEST_AGE_SECONDS * 1000) {
      throw new PluginAuthenticationError(401, 'Plugin request timestamp is stale or invalid.')
    }

    const site = this.siteService.get(siteId)
    if (site.status !== 'active') {
      throw new PluginAuthenticationError(403, 'Site is disabled.')
    }

    const expected = createPluginSignature(this.credentialService.getActiveSecret(siteId), timestamp, rawBody)
    const expectedBuffer = Buffer.from(expected)
    const signatureBuffer = Buffer.from(signature)

    if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
      throw new PluginAuthenticationError(401, 'Plugin request signature is invalid.')
    }

    return { siteId, requestTimestamp: timestamp, rawBody }
  }
}
