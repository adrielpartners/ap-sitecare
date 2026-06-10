import type { Site } from '../domain/types'
import { CredentialService, type SafeSiteCredential } from './credential-service'
import { HealthService } from './health-service'
import { SiteService } from './site-service'

export interface SiteDetail {
  site: Site
  activeCredential: SafeSiteCredential | null
  health: ReturnType<HealthService['getSummary']>
}

export class SiteRegistrationService {
  constructor(
    private readonly siteService = new SiteService(),
    private readonly healthService = new HealthService(),
    private readonly credentialService?: CredentialService
  ) {}

  getDetail(siteId: string): SiteDetail {
    return {
      site: this.siteService.get(siteId),
      activeCredential: this.credentialService?.getActiveSummary(siteId) ?? null,
      health: this.healthService.getSummary(siteId)
    }
  }

  testConnection(siteId: string): {
    status: 'connected' | 'awaiting-check-in' | 'credentials-required'
    message: string
  } {
    this.siteService.get(siteId)
    const credential = this.credentialService?.getActiveSummary(siteId)
    if (!credential) {
      return {
        status: 'credentials-required',
        message: 'Generate site credentials before connecting the reporter plugin.'
      }
    }

    if (!this.healthService.getLatestSnapshot(siteId)) {
      return {
        status: 'awaiting-check-in',
        message: 'Credentials are ready. Install the reporter plugin and send the first check-in.'
      }
    }

    return {
      status: 'connected',
      message: 'The site has successfully reported health data.'
    }
  }
}
