import type { Site } from '../domain/types'
import { CredentialService, type SafeSiteCredential } from './credential-service'
import { HealthService } from './health-service'
import { SiteService } from './site-service'

export interface SiteDetail {
  site: Site
  activeCredential: SafeSiteCredential | null
  health: Awaited<ReturnType<HealthService['getSummary']>>
}

export class SiteRegistrationService {
  constructor(
    private readonly siteService = new SiteService(),
    private readonly healthService = new HealthService(),
    private readonly credentialService?: CredentialService
  ) {}

  async getDetail(siteId: string): Promise<SiteDetail> {
    return {
      site: await this.siteService.get(siteId),
      activeCredential: this.credentialService
        ? await this.credentialService.getActiveSummary(siteId)
        : null,
      health: await this.healthService.getSummary(siteId)
    }
  }

  async testConnection(siteId: string): Promise<{
    status: 'connected' | 'awaiting-check-in' | 'credentials-required'
    message: string
  }> {
    await this.siteService.get(siteId)
    const credential = this.credentialService
      ? await this.credentialService.getActiveSummary(siteId)
      : null
    if (!credential) {
      return {
        status: 'credentials-required',
        message: 'Generate site credentials before connecting the reporter plugin.'
      }
    }

    if (!await this.healthService.getLatestSnapshot(siteId)) {
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
